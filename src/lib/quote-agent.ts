import { draftQuoteText, QuoteDraftMeta } from "@/lib/format";
import { filterInboundEmail } from "@/lib/inbound-filter";
import { findBestMatches } from "@/lib/matcher";
import { parseRFQ } from "@/lib/parser";
import { buildQuoteLines, quoteTotal } from "@/lib/pricing";
import { sendQuoteEmail } from "@/lib/quote-email-service";
import {
  AppData,
  AppUser,
  BuyerMessage,
  MatchResult,
  Quote,
  QuoteAgentActivity,
  QuoteAgentSession,
  QuoteApprovalRequest,
  QuoteConversationMessage,
  QuoteLine,
  QuoteUiCard,
  QuoteWorkflowStage
} from "@/lib/types";

const nowIso = () => new Date().toISOString();
const normalizeLookup = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normalizeCompact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const technicalStopWords = new Set([
  "quote", "quoted", "quoting", "email", "emails", "buyer", "buyers", "company", "latest", "find", "look", "parse",
  "from", "for", "show", "need", "with", "about", "request", "rfq", "please", "this", "that", "their", "them",
  "the", "and", "or", "a", "an", "to", "of", "on", "in"
]);

const newMessage = (role: QuoteConversationMessage["role"], content: string): QuoteConversationMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  at: nowIso()
});

const newActivity = (
  actor: QuoteAgentActivity["actor"],
  kind: QuoteAgentActivity["kind"],
  detail: string
): QuoteAgentActivity => ({
  id: crypto.randomUUID(),
  actor,
  kind,
  detail,
  at: nowIso()
});

const buildMeta = (session: QuoteAgentSession): QuoteDraftMeta => ({
  buyerName: session.buyerName || session.customerName || "Buyer",
  subject: session.quoteDraft?.subject || `Quotation for ${session.customerName || "Buyer"}`,
  intro: session.quoteDraft?.body
    ? session.quoteDraft.body.split("\n\n").slice(0, 2).join("\n\n")
    : `Thank you for the opportunity. Please find our quotation below for ${session.customerName || "your request"}.`,
  eta: session.quoteDraft?.eta || "Earliest available",
  validDays: 7,
  incoterm: "FOB Origin",
  paymentTerms: "Net 30",
  freightTerms: "Packed for sea freight",
  notes: ""
});

const rebuildDraft = (session: QuoteAgentSession, nextMarginPercent?: number, updates?: Partial<QuoteAgentSession["quoteDraft"]>) => {
  if (!session.quoteDraft) return session;
  const previousMargin = Math.max(0, session.marginPercent ?? 12);
  const marginPercent = Math.max(0, nextMarginPercent ?? previousMargin);
  const prevMultiplier = 1 + previousMargin / 100;
  const nextMultiplier = 1 + marginPercent / 100;
  const sourceLines = updates?.lines ?? session.quoteDraft.lines;
  const nextLines = sourceLines.map((line) => {
    const normalizedBaseUnitPrice = prevMultiplier > 0 ? line.unitPrice / prevMultiplier : line.unitPrice;
    const unitPrice = normalizedBaseUnitPrice * nextMultiplier;
    return {
      ...line,
      unitPrice,
      extendedPrice: unitPrice * line.quantity
    };
  });
  const total = quoteTotal(nextLines);
  const eta = updates?.eta ?? session.quoteDraft.eta;
  const subject = updates?.subject ?? session.quoteDraft.subject;
  const body = draftQuoteText(session.customerName || "Buyer", nextLines, total, { ...buildMeta(session), eta, subject });
  return {
    ...session,
    marginPercent,
    quoteDraft: {
      lines: nextLines,
      total,
      subject,
      body,
      eta
    }
  };
};

const latestInboundCandidate = async (data: AppData, user: AppUser) => {
  const inbound = [...data.buyerMessages]
    .filter((message) => message.managerUserId === user.id && message.direction === "inbound")
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  for (const message of inbound) {
    const decision = await filterInboundEmail(message.subject, message.bodyText);
    if (decision.accept) return message;
  }

  return inbound[0] || null;
};

const extractRequestedCompany = (command: string) => {
  const raw = command.trim();
  const domain = raw.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (domain?.[1]) return `@${domain[1].toLowerCase()}`;
  const quoted = raw.match(/["']([^"']{2,120})["']/);
  if (quoted?.[1]) return quoted[1].trim();

  const patterns = [
    /\b(?:from|for)\s+([A-Za-z0-9&.,'()\- ]{2,80}?)(?:\s+(?:email|buyer|company|request|rfq)\b|[.?!,]|$)/i,
    /\b(?:look for|find|parse|quote)\s+(?:the\s+)?(?:latest\s+)?(?:email|rfq|request)?\s*(?:from\s+)?([A-Za-z0-9&.,'()\- ]{2,80}?)(?:\s+(?:email|buyer|company|request|rfq)\b|[.?!,]|$)/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
};

const extractTechnicalHints = (command: string) => {
  const lowered = command.toLowerCase();
  const matches = lowered.match(/[a-z0-9#./"-]+/g) || [];
  const tokens = matches
    .map((token) => token.replace(/^["']|["']$/g, ""))
    .filter((token) => token.length >= 2)
    .filter((token) => !technicalStopWords.has(token))
    .filter((token) => /[\d"]/i.test(token) || /(pipe|tube|tubing|valve|ball|gate|globe|check|butterfly|plug|needle|relief|control|flange|elbow|tee|reducer|cap|coupling|union|nipple|olet|gasket|strainer|steel|stainless|carbon|a105|a106|a234|a312|wpb|tp316|tp304|316l|304l|sch|class|wog|bw|sw|npt|rf|rtj|smls|seamless|welded|dn|nps|inch|in|ft|m|pcs|ea)/.test(token))
    .slice(0, 10);
  return Array.from(new Set(tokens));
};

const resolveTargetMessage = async (data: AppData, user: AppUser, command: string) => {
  const target = extractRequestedCompany(command);
  const technicalHints = extractTechnicalHints(command);
  if (!target) {
    return { target: "", message: await latestInboundCandidate(data, user) };
  }

  const targetNorm = normalizeLookup(target);
  const targetCompact = normalizeCompact(target);
  const targetDomain = target.startsWith("@") ? target.slice(1).toLowerCase() : "";
  const inbound = [...data.buyerMessages]
    .filter((message) => message.managerUserId === user.id && message.direction === "inbound")
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  const scored = await Promise.all(inbound.map(async (message) => {
    const buyer = data.buyers.find((candidate) => candidate.id === message.buyerId);
    const buyerCompany = buyer?.companyName || "";
    const haystacks = [
      buyerCompany,
      message.fromEmail,
      message.subject,
      message.bodyText.slice(0, 800)
    ];

    let score = 0;
    for (const haystack of haystacks) {
      const lookup = normalizeLookup(haystack);
      const compact = normalizeCompact(haystack);
      if (!lookup && !compact) continue;
      if (lookup.includes(targetNorm)) score += 5;
      if (compact.includes(targetCompact)) score += 4;
    }
    if (targetDomain) {
      const fromDomain = message.fromEmail.split("@")[1]?.toLowerCase() || "";
      if (fromDomain === targetDomain) score += 10;
      else if (fromDomain.endsWith(`.${targetDomain}`) || targetDomain.endsWith(`.${fromDomain}`)) score += 7;
    }

    const searchableText = normalizeLookup(`${message.subject} ${message.bodyText.slice(0, 2000)}`);
    for (const hint of technicalHints) {
      const normalizedHint = normalizeLookup(hint);
      if (normalizedHint && searchableText.includes(normalizedHint)) score += 2;
    }

    const decision = await filterInboundEmail(message.subject, message.bodyText);
    if (decision.accept) score += 1;
    return { message, score };
  }));

  const best = scored
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.message.receivedAt.localeCompare(a.message.receivedAt))[0];

  return { target, message: best?.message || null };
};

const hydrateQuoteSessionFromMessage = async (
  data: AppData,
  user: AppUser,
  session: QuoteAgentSession,
  sourceMessage: BuyerMessage,
  seed?: { buyerName?: string; buyerEmail?: string; rfqText?: string }
) => {
  const buyerEmail = seed?.buyerEmail?.trim() || sourceMessage.fromEmail;
  const buyerName = seed?.buyerName?.trim() || data.buyers.find((buyer) => buyer.id === sourceMessage.buyerId)?.companyName || "Buyer";
  const rfqText = seed?.rfqText?.trim() || sourceMessage.bodyText;
  const marginPercent = session.marginPercent ?? 12;
  const extracted = await parseRFQ(rfqText, "openai");
  const matches = findBestMatches(extracted, data.inventory);
  const quoteLines = buildQuoteLines(matches, data.surcharges, marginPercent);
  const total = quoteTotal(quoteLines);
  const draftSubject = `Quotation for ${buyerName}`;
  const draftBody = draftQuoteText(buyerName, quoteLines, total, {
    buyerName,
    subject: draftSubject,
    intro: `Thank you for the opportunity. Please find our quotation below for ${buyerName}.`,
    eta: "Earliest available",
    validDays: 7,
    incoterm: "FOB Origin",
    paymentTerms: "Net 30",
    freightTerms: "Packed for sea freight",
    notes: "",
    senderName: user.name,
    senderTitle: user.role,
    companyName: user.companyName
  });

  const approval: QuoteApprovalRequest = {
    id: crypto.randomUUID(),
    type: "send_quote_email",
    title: "Approve sending this quote",
    detail: `Approve sending the draft quote to ${buyerEmail}?`,
    createdAt: nowIso(),
    status: "pending"
  };

  return {
    ...session,
    updatedAt: nowIso(),
    title: `Quote ${buyerName}`,
    customerName: buyerName,
    buyerEmail,
    buyerName,
    sourceBuyerId: sourceMessage.buyerId,
    sourceMessageId: sourceMessage.id,
    sourceMessageSubject: sourceMessage.subject,
    rfqText,
    quoteDraft: {
      lines: quoteLines,
      total,
      subject: draftSubject,
      body: draftBody,
      eta: "Earliest available"
    },
    approval,
    stage: "awaiting_approval" as const,
    status: "awaiting_approval" as const,
    cards: buildCards({
      sourceMessage,
      buyerName,
      buyerEmail,
      extractedText: rfqText,
      lines: extracted,
      matches,
      quoteLines,
      total,
      draftSubject,
      draftBody,
      approval
    })
  };
};

const buildRiskCard = (matches: MatchResult[], sourceMessage: BuyerMessage | null): QuoteUiCard | null => {
  const items: string[] = [];
  const missing = matches.filter((match) => match.stockStatus === "red");
  const partial = matches.filter((match) => match.stockStatus === "yellow");

  if (sourceMessage?.attachments?.length) {
    items.push("Attachment metadata exists on the buyer email, but attachment text is not stored in the inbox record. Current quote uses the email body and merged intake text only.");
  }
  if (missing.length) items.push(`${missing.length} line item${missing.length === 1 ? "" : "s"} are out of stock and should be routed to sourcing.`);
  if (partial.length) items.push(`${partial.length} line item${partial.length === 1 ? "" : "s"} are only partially covered by inventory.`);
  if (!items.length) return null;

  return {
    id: crypto.randomUUID(),
    type: "risk_alert",
    title: "Exceptions and risk",
    severity: missing.length ? "critical" : "warning",
    items
  };
};

const buildCards = (params: {
  sourceMessage: BuyerMessage;
  buyerName: string;
  buyerEmail: string;
  extractedText: string;
  lines: Awaited<ReturnType<typeof parseRFQ>>;
  matches: MatchResult[];
  quoteLines: QuoteLine[];
  total: number;
  draftSubject: string;
  draftBody: string;
  approval?: QuoteApprovalRequest;
}): QuoteUiCard[] => {
  const cards: QuoteUiCard[] = [
    {
      id: crypto.randomUUID(),
      type: "email_preview",
      title: "Latest buyer email",
      email: {
        subject: params.sourceMessage.subject,
        fromEmail: params.sourceMessage.fromEmail,
        receivedAt: params.sourceMessage.receivedAt,
        bodyText: params.sourceMessage.bodyText,
        buyerName: params.buyerName,
        buyerEmail: params.buyerEmail,
        attachments: params.sourceMessage.attachments
      }
    },
    {
      id: crypto.randomUUID(),
      type: "rfq_extraction",
      title: "RFQ extraction",
      summary: `Parsed ${params.lines.length} requested line item${params.lines.length === 1 ? "" : "s"} from the latest buyer request.`,
      lineItems: params.lines
    },
    {
      id: crypto.randomUUID(),
      type: "inventory_match",
      title: "Inventory comparison",
      matches: params.matches
    },
    {
      id: crypto.randomUUID(),
      type: "quote_preview",
      title: "Draft quote package",
      customerName: params.buyerName,
      buyerEmail: params.buyerEmail,
      lines: params.quoteLines,
      total: params.total,
      draftSubject: params.draftSubject,
      draftBody: params.draftBody,
      eta: "Earliest available"
    }
  ];

  const riskCard = buildRiskCard(params.matches, params.sourceMessage);
  if (riskCard) cards.splice(3, 0, riskCard);
  if (params.approval) {
    cards.push({
      id: crypto.randomUUID(),
      type: "approval",
      title: "Approval required",
      approval: params.approval
    });
  }
  return cards;
};

const updateDraftCard = (session: QuoteAgentSession): QuoteUiCard[] => {
  return session.cards.map((card) => {
    if (card.type === "quote_preview" && session.quoteDraft) {
      return {
        ...card,
        lines: session.quoteDraft.lines,
        total: session.quoteDraft.total,
        draftSubject: session.quoteDraft.subject,
        draftBody: session.quoteDraft.body,
        eta: session.quoteDraft.eta
      };
    }
    if (card.type === "approval" && session.approval) {
      return { ...card, approval: session.approval };
    }
    return card;
  });
};

const stageFromApproval = (approval?: QuoteApprovalRequest): QuoteWorkflowStage => {
  if (!approval) return "draft_ready";
  if (approval.status === "approved") return "sent";
  if (approval.status === "rejected") return "rejected";
  return "awaiting_approval";
};

export const createQuoteAgentSession = async (
  data: AppData,
  user: AppUser,
  command: string,
  seed?: { sourceMessageId?: string; buyerName?: string; buyerEmail?: string; rfqText?: string }
) => {
  const resolved = seed?.sourceMessageId
    ? {
      target: seed.buyerName || seed.buyerEmail || "",
      message: data.buyerMessages.find((message) => message.id === seed.sourceMessageId && message.managerUserId === user.id) || null
    }
    : await resolveTargetMessage(data, user, command);
  const sourceMessage = resolved.message;
  const session: QuoteAgentSession = {
    id: crypto.randomUUID(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdByUserId: user.id,
    status: "active",
    stage: "idle",
    title: "Conversation quote session",
    marginPercent: 12,
    messages: [newMessage("user", command)],
    cards: [],
    activities: [newActivity("user", "step", command)]
  };

  if (!sourceMessage) {
    session.status = "error";
    session.stage = "error";
    session.messages.push(newMessage("assistant", resolved.target
      ? `I could not find a buyer email from ${resolved.target} in your inbox to quote from.`
      : "I could not find any buyer email in your inbox to start quoting from."
    ));
    session.activities.push(newActivity("agent", "error", resolved.target
      ? `No buyer email from ${resolved.target} was available for quoting.`
      : "No buyer email was available for quoting."
    ));
    return session;
  }
  const hydrated = await hydrateQuoteSessionFromMessage(data, user, session, sourceMessage, seed);
  session.messages.push(
    newMessage("assistant", resolved.target
      ? `I found the latest buyer RFQ from ${hydrated.buyerEmail} for ${hydrated.buyerName}, parsed ${hydrated.quoteDraft?.lines.length || 0} priced line item${(hydrated.quoteDraft?.lines.length || 0) === 1 ? "" : "s"}, checked inventory, and prepared a draft quote. Review the cards and approve before I send anything.`
      : `I found the latest buyer RFQ from ${hydrated.buyerEmail}, parsed ${hydrated.quoteDraft?.lines.length || 0} priced line item${(hydrated.quoteDraft?.lines.length || 0) === 1 ? "" : "s"}, checked inventory, and prepared a draft quote. Review the cards and approve before I send anything.`
    )
  );
  session.activities.push(
    newActivity("agent", "step", `${resolved.target ? `Selected latest buyer email from ${resolved.target}` : "Selected latest buyer email"}: ${sourceMessage.subject || "(no subject)"}`),
    newActivity("agent", "step", `Parsed ${hydrated.quoteDraft?.lines.length || 0} priced line item${(hydrated.quoteDraft?.lines.length || 0) === 1 ? "" : "s"}`),
    newActivity("agent", "step", "Compared parsed items against inventory and pricing rules"),
    newActivity("agent", "approval_requested", `Approval requested to send quote to ${hydrated.buyerEmail}`)
  );
  return { ...hydrated, messages: session.messages, activities: session.activities };
};

export const applyConversationCommand = async (data: AppData, user: AppUser, session: QuoteAgentSession, command: string) => {
  const next = { ...session, updatedAt: nowIso(), messages: [...session.messages, newMessage("user", command)], activities: [...session.activities, newActivity("user", "step", command)] };
  const lower = command.toLowerCase();

  if (/\b(?:quote|parse|find|look for|show)\b/.test(lower) && /\b(?:from|for)\b/.test(lower)) {
    const resolved = await resolveTargetMessage(data, user, command);
    if (resolved.target) {
      if (!resolved.message) {
        next.messages.push(newMessage("assistant", `I could not find a buyer email from ${resolved.target} in your inbox.`));
        next.activities.push(newActivity("agent", "error", `No buyer email from ${resolved.target} was available for quoting.`));
        return next;
      }
      const retargeted = await hydrateQuoteSessionFromMessage(data, user, next, resolved.message);
      retargeted.messages = [
        ...next.messages,
        newMessage("assistant", `I switched the quote session to the latest qualifying buyer email from ${resolved.target}, parsed the RFQ, checked inventory, and refreshed the draft quote.`)
      ];
      retargeted.activities = [
        ...next.activities,
        newActivity("agent", "step", `Retargeted quote session to ${resolved.target}: ${resolved.message.subject || "(no subject)"}`)
      ];
      return retargeted;
    }
  }

  if (/show .*buyer email|show .*email again/.test(lower)) {
    next.messages.push(newMessage("assistant", "Showing the buyer email again in the quote thread cards."));
    return next;
  }

  const marginMatch = lower.match(/(?:set|change|apply|use).{0,24}margin(?: to)?\s+(\d+(?:\.\d+)?)\s*%?/);
  if (marginMatch && next.quoteDraft) {
    const marginPercent = Number(marginMatch[1]);
    const rebased = rebuildDraft(next, marginPercent);
    rebased.cards = updateDraftCard(rebased);
    rebased.messages.push(newMessage("assistant", `Updated the quote margin to ${marginPercent}%. Pricing and totals have been recalculated.`));
    rebased.activities.push(newActivity("agent", "step", `Updated quote margin to ${marginPercent}%`));
    return rebased;
  }

  if (/don'?t include .*out[- ]of[- ]stock|exclude .*out[- ]of[- ]stock/.test(lower) && next.quoteDraft) {
    const lines = next.quoteDraft.lines.filter((line) => line.stockStatus !== "red");
    const revised = rebuildDraft(next, next.marginPercent, { lines });
    revised.cards = updateDraftCard(revised);
    revised.messages.push(newMessage("assistant", `Removed out-of-stock lines. ${lines.length} line item${lines.length === 1 ? "" : "s"} remain in the draft quote.`));
    revised.activities.push(newActivity("agent", "step", "Removed out-of-stock items from the proposed quote"));
    return revised;
  }

  const nthMatch = lower.match(/use the (\d+)(?:st|nd|rd|th)? line item only/);
  if (nthMatch && next.quoteDraft) {
    const index = Number(nthMatch[1]) - 1;
    const selected = next.quoteDraft.lines[index];
    if (!selected) {
      next.messages.push(newMessage("assistant", "I could not find that line item number in the current draft."));
      next.activities.push(newActivity("agent", "error", "User referenced a line item that does not exist in the current draft"));
      return next;
    }
    const lines = [selected];
    const revised = rebuildDraft(next, next.marginPercent, { lines });
    revised.cards = updateDraftCard(revised);
    revised.messages.push(newMessage("assistant", `I narrowed the quote to line item ${nthMatch[1]} only.`));
    revised.activities.push(newActivity("agent", "step", `Reduced quote scope to line item ${nthMatch[1]}`));
    return revised;
  }

  const qtyMatch = lower.match(/change (?:line )?(\d+)\s+quantity to\s+(\d+(?:\.\d+)?)/);
  if (qtyMatch && next.quoteDraft) {
    const index = Number(qtyMatch[1]) - 1;
    const quantity = Number(qtyMatch[2]);
    const target = next.quoteDraft.lines[index];
    if (!target) {
      next.messages.push(newMessage("assistant", "I could not find that line item number to update the quantity."));
      return next;
    }
    const lines = next.quoteDraft.lines.map((line, idx) => idx === index ? {
      ...line,
      quantity,
    } : line);
    const revised = rebuildDraft(next, next.marginPercent, { lines });
    revised.cards = updateDraftCard(revised);
    revised.messages.push(newMessage("assistant", `Updated line ${qtyMatch[1]} quantity to ${quantity}.`));
    revised.activities.push(newActivity("agent", "step", `Adjusted line ${qtyMatch[1]} quantity to ${quantity}`));
    return revised;
  }

  const etaMatch = lower.match(/change (?:the )?lead time to\s+(.+)/);
  if (etaMatch && next.quoteDraft) {
    const eta = etaMatch[1].trim().replace(/\.$/, "");
    const revised = rebuildDraft(next, next.marginPercent, { eta });
    revised.cards = updateDraftCard(revised);
    revised.messages.push(newMessage("assistant", `Updated lead time to ${eta}.`));
    revised.activities.push(newActivity("agent", "step", `Updated proposed lead time to ${eta}`));
    return revised;
  }

  if (/more concise email|shorter email|draft a more concise email/.test(lower) && next.quoteDraft) {
    const conciseBody = draftQuoteText(next.customerName || "Buyer", next.quoteDraft.lines, next.quoteDraft.total, {
      ...buildMeta(next),
      intro: `Please find our quotation for ${next.customerName || "your request"} below.`
    });
    next.quoteDraft = { ...next.quoteDraft, body: conciseBody };
    next.cards = updateDraftCard(next);
    next.messages.push(newMessage("assistant", "I tightened the email copy and kept the commercial content intact."));
    next.activities.push(newActivity("agent", "step", "Condensed the outbound draft email"));
    return next;
  }

  if (/save (?:this )?(?:quote|workflow|draft)|save draft/.test(lower) && next.quoteDraft) {
    const saved = saveQuoteDraftSession(data, user, next);
    saved.messages.push(newMessage("assistant", "Saved this quote workflow as a draft. It will stay available in Quote History and in this session list."));
    saved.activities.push(newActivity("agent", "step", "Saved quote workflow as draft"));
    return saved;
  }

  if (/approve/.test(lower) && next.approval?.status === "pending") {
    return approveQuoteSend(data, user, next);
  }

  if (/reject|do not send|don'?t send/.test(lower) && next.approval?.status === "pending") {
    next.approval = { ...next.approval, status: "rejected" };
    next.status = "rejected";
    next.stage = "rejected";
    next.cards = updateDraftCard(next);
    next.messages.push(newMessage("assistant", "I cancelled the outbound send. The draft remains available for edits."));
    next.activities.push(newActivity("user", "approval_rejected", "User rejected the outbound quote send"));
    return next;
  }

  if (/discard (?:this )?(?:quote|workflow|session)|close (?:this )?workflow/.test(lower)) {
    const discarded = discardQuoteSession(next);
    discarded.messages.push(newMessage("assistant", "Discarded this quote workflow. It will remain in the audit trail but is closed from active work."));
    discarded.activities.push(newActivity("agent", "step", "Discarded quote workflow"));
    return discarded;
  }

  next.messages.push(newMessage("assistant", "I kept the current quote session intact. You can ask me to show the buyer email, revise a line item, change lead time, exclude out-of-stock items, or approve the send."));
  return next;
};

export const saveQuoteDraftSession = (data: AppData, user: AppUser, session: QuoteAgentSession) => {
  if (!session.quoteDraft) return session;
  const now = nowIso();
  const quote: Quote = {
    id: session.savedQuoteId || crypto.randomUUID(),
    customerName: session.customerName || "Buyer",
    createdByUserId: user.id,
    itemsQuoted: session.quoteDraft.lines,
    totalPrice: session.quoteDraft.total,
    status: "Draft",
    createdAt: session.savedAt || now,
    sentToEmail: session.buyerEmail,
    lastSentSubject: session.quoteDraft.subject
  };

  const existingIndex = data.quotes.findIndex((candidate) => candidate.id === quote.id);
  if (existingIndex === -1) data.quotes.unshift(quote);
  else data.quotes[existingIndex] = { ...data.quotes[existingIndex], ...quote };

  return {
    ...session,
    updatedAt: now,
    status: "saved" as const,
    savedQuoteId: quote.id,
    savedAt: now
  };
};

export const discardQuoteSession = (session: QuoteAgentSession): QuoteAgentSession => ({
  ...session,
  updatedAt: nowIso(),
  status: "discarded",
  stage: session.stage === "sent" ? "sent" : "rejected",
  discardedAt: nowIso(),
  approval: session.approval?.status === "pending"
    ? { ...session.approval, status: "rejected" }
    : session.approval
});

export const approveQuoteSend = async (_data: AppData, user: AppUser, session: QuoteAgentSession) => {
  if (!session.approval || session.approval.status !== "pending" || !session.quoteDraft || !session.buyerEmail) {
    return session;
  }

  const meta = buildMeta(session);
  const sent = await sendQuoteEmail({
    userId: user.id,
    userEmail: user.email,
    buyerEmail: session.buyerEmail,
    customerName: session.customerName || "Buyer",
    lines: session.quoteDraft.lines,
    total: session.quoteDraft.total,
    meta
  });

  const approval = { ...session.approval, status: "approved" as const };
  const next: QuoteAgentSession = {
    ...session,
    updatedAt: nowIso(),
    approval,
    stage: stageFromApproval(approval),
    status: "completed",
    cards: session.cards
      .filter((card) => card.type !== "approval")
      .concat({
        id: crypto.randomUUID(),
        type: "risk_alert",
        title: "Send confirmation",
        severity: "info",
        items: [sent.message]
      }),
    messages: [...session.messages, newMessage("assistant", `${sent.message}. The quote session is fully logged in the timeline.`)],
    activities: [
      ...session.activities,
      newActivity("user", "approval_granted", `User approved send to ${session.buyerEmail}`),
      newActivity("agent", "send", sent.message)
    ]
  };
  return next;
};
