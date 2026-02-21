import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { requireUser } from "@/lib/server-auth";

type ChatAction =
  | { type: "set_margin"; value: number }
  | { type: "set_customer"; value: string }
  | { type: "set_buyer_email"; value: string }
  | { type: "set_rfq"; value: string; mode: "replace" | "append" }
  | { type: "parse_quote" }
  | { type: "save_quote" };

type ChatContext = {
  customerName?: string;
  buyerEmail?: string;
  rfqText?: string;
  marginPercent?: number;
  lineCount?: number;
  stockSummary?: { green: number; yellow: number; red: number };
};

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const suggestMargin = (context: ChatContext, message: string) => {
  const source = `${message}\n${context.rfqText ?? ""}`.toLowerCase();
  let value = 12;
  const reasons: string[] = [];

  if (/\b(253ma|2205|duplex|super\s*duplex|904l|alloy)\b/i.test(source)) {
    value += 3;
    reasons.push("Specialty/alloy material complexity");
  }
  if (/\b(rush|urgent|asap|earliest eta|expedite)\b/i.test(source)) {
    value += 2;
    reasons.push("Urgent lead-time request");
  }
  if (context.stockSummary && (context.stockSummary.red > 0 || context.stockSummary.yellow > 0)) {
    value += 2;
    reasons.push("Inventory availability risk");
  }
  if (/\b(fob|cif|ddp|sea freight|air freight|export)\b/i.test(source)) {
    value += 1;
    reasons.push("Logistics/terms complexity");
  }
  if (/\b(high volume|bulk|repeat order)\b/i.test(source)) {
    value -= 2;
    reasons.push("Potential volume discount");
  }

  return {
    recommended: Math.max(6, Math.min(30, value)),
    reasons: reasons.length ? reasons : ["Standard baseline margin for typical RFQ complexity"]
  };
};

const evaluateBuyer = async (emailRaw: string, customerNameRaw?: string) => {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !looksLikeEmail(email)) {
    return { status: "needs_review", summary: "Buyer email is missing or invalid.", details: ["Provide a valid buyer email."] };
  }

  const data = await readData();
  const knownBuyer = data.buyers.find((b) => b.email.toLowerCase() === email);
  const msgs = knownBuyer ? data.buyerMessages.filter((m) => m.buyerId === knownBuyer.id) : [];
  const domain = email.split("@")[1] ?? "";
  const genericDomains = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com"]);

  const details: string[] = [];
  let risk = 0;

  if (knownBuyer) {
    details.push(`Existing buyer profile found (${msgs.length} historical messages).`);
  } else {
    details.push("No existing buyer history in workspace.");
    risk += 1;
  }
  if (genericDomains.has(domain)) {
    details.push("Email uses a generic domain; request company details and PO authority.");
    risk += 1;
  } else {
    details.push(`Domain appears corporate (${domain}).`);
  }
  if (customerNameRaw && customerNameRaw.trim().length >= 2) {
    details.push(`Customer name present: ${customerNameRaw.trim()}.`);
  } else {
    details.push("Customer name is missing.");
    risk += 1;
  }

  return {
    status: risk >= 2 ? "needs_review" : "looks_valid",
    summary: risk >= 2 ? "Buyer should be validated before final quote release." : "Buyer looks valid for quoting workflow.",
    details
  };
};

const evaluateLogistics = (input: string) => {
  const source = input.toLowerCase();
  const found: string[] = [];
  const missing: string[] = [];

  if (/\b(fob|cif|cnf|exw|dap|ddp)\b/i.test(source)) found.push("Incoterm");
  else missing.push("Incoterm (FOB/CIF/EXW/...)");

  if (/\b(eta|lead time|delivery|ship(?:ping)? date)\b/i.test(source)) found.push("Delivery timeline");
  else missing.push("Delivery timeline / ETA");

  if (/\b(sea freight|air freight|truck|courier|vessel)\b/i.test(source)) found.push("Transport mode");
  else missing.push("Transport mode (sea/air/truck)");

  if (/\b(packed|packaging|crate|pallet)\b/i.test(source)) found.push("Packaging instruction");
  else missing.push("Packaging instruction");

  if (/\b(destination|port|warehouse|address)\b/i.test(source)) found.push("Destination");
  else missing.push("Destination / Port");

  return { found, missing };
};

const extractActions = (message: string, context: ChatContext, uploadedFile?: { kind: "inventory_file" | "rfq_text"; text?: string }) => {
  const actions: ChatAction[] = [];
  const lower = message.toLowerCase();

  const marginMatch = message.match(/margin(?:\s*(?:to|=))?\s*(\d{1,2}(?:\.\d+)?)\s*%?/i);
  if (marginMatch) {
    actions.push({ type: "set_margin", value: Number(marginMatch[1]) });
  }

  const customerMatch = message.match(/customer(?:\s+is|\s*=|:)\s*([a-z0-9 .&'-]{2,80})/i);
  if (customerMatch) {
    actions.push({ type: "set_customer", value: customerMatch[1].trim() });
  }

  const buyerEmailMatch = message.match(/\b(?:buyer\s*email|email)(?:\s+is|\s*=|:)\s*([^\s,;]+)/i);
  if (buyerEmailMatch && looksLikeEmail(buyerEmailMatch[1])) {
    actions.push({ type: "set_buyer_email", value: buyerEmailMatch[1].trim().toLowerCase() });
  }

  const replaceRfqMatch = message.match(/(?:replace|set)\s+(?:the\s+)?rfq(?:\s+to)?\s*:\s*([\s\S]+)/i);
  if (replaceRfqMatch) {
    actions.push({ type: "set_rfq", value: replaceRfqMatch[1].trim(), mode: "replace" });
  }

  const appendRfqMatch = message.match(/(?:append|add)\s+(?:to\s+)?(?:the\s+)?rfq\s*:\s*([\s\S]+)/i);
  if (appendRfqMatch) {
    actions.push({ type: "set_rfq", value: appendRfqMatch[1].trim(), mode: "append" });
  }

  const asksToParse = /(parse|match|price|quote this|run quote|generate quote|analyze rfq)/i.test(lower);
  if (uploadedFile?.kind === "rfq_text" && asksToParse && uploadedFile.text) {
    actions.push({ type: "set_rfq", value: uploadedFile.text, mode: "replace" });
  }

  if (asksToParse) {
    actions.push({ type: "parse_quote" });
  }

  if (/(save|log)\s+(?:this\s+)?quote/i.test(lower)) {
    actions.push({ type: "save_quote" });
  }

  const wantsSuggestedMargin = /(suggest|recommend).*(margin)|margin.*(suggest|recommend)/i.test(lower);
  const wantsApplySuggested = /(apply|use).*(suggested|recommended).*(margin)|set.*margin.*recommended/i.test(lower);
  if (wantsSuggestedMargin && wantsApplySuggested) {
    const suggestion = suggestMargin(context, message);
    actions.push({ type: "set_margin", value: suggestion.recommended });
  }

  return actions;
};

const buildReply = (
  actions: ChatAction[],
  context: ChatContext,
  opts: {
    uploadedFile?: { kind: "inventory_file" | "rfq_text"; name?: string };
    buyerCheck?: Awaited<ReturnType<typeof evaluateBuyer>>;
    logistics?: ReturnType<typeof evaluateLogistics>;
    margin?: ReturnType<typeof suggestMargin>;
  }
) => {
  const lines: string[] = [];
  if (opts.uploadedFile?.kind === "inventory_file") {
    lines.push(`Inventory file ${opts.uploadedFile.name ?? "inventory sheet"} uploaded.`);
  }
  if (opts.uploadedFile?.kind === "rfq_text") {
    lines.push(`RFQ text file ${opts.uploadedFile.name ?? "file"} received.`);
  }

  for (const action of actions) {
    if (action.type === "set_margin") lines.push(`Setting margin to ${action.value}%.`);
    if (action.type === "set_customer") lines.push(`Updating customer to ${action.value}.`);
    if (action.type === "set_buyer_email") lines.push(`Setting buyer email to ${action.value}.`);
    if (action.type === "set_rfq") lines.push(action.mode === "replace" ? "Replacing RFQ workspace text." : "Appending to RFQ workspace text.");
    if (action.type === "parse_quote") lines.push("Running parse, inventory match, and pricing.");
    if (action.type === "save_quote") lines.push("Saving the current quote as Draft.");
  }

  if (opts.margin) {
    lines.push(`Recommended margin: ${opts.margin.recommended}% (${opts.margin.reasons.join("; ")}).`);
  }

  if (opts.logistics) {
    lines.push(`Logistics check: found ${opts.logistics.found.length ? opts.logistics.found.join(", ") : "none"}.`);
    if (opts.logistics.missing.length) {
      lines.push(`Missing: ${opts.logistics.missing.join(", ")}.`);
    }
  }

  if (opts.buyerCheck) {
    lines.push(`Buyer validation: ${opts.buyerCheck.summary}`);
    if (opts.buyerCheck.details.length) {
      lines.push(opts.buyerCheck.details.join(" "));
    }
  }

  if (!lines.length) {
    const baseMargin = suggestMargin(context, "");
    return `I can validate buyer, check logistics, suggest margin, update RFQ/customer, parse, and save quotes. Suggested baseline margin now: ${baseMargin.recommended}%.`;
  }

  return lines.join(" ");
};

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const message = String(body.message ?? "").trim();
  const context = (body.context ?? {}) as ChatContext;
  const uploadedFile = body.uploadedFile as { kind: "inventory_file" | "rfq_text"; text?: string; name?: string } | undefined;

  if (!message && !uploadedFile) {
    return NextResponse.json({ error: "Message or uploaded file is required" }, { status: 400 });
  }

  const combinedText = `${message}\n${context.rfqText ?? ""}\n${uploadedFile?.text ?? ""}`.trim();
  const wantsBuyerValidation = /(validate|verify|check).*(buyer|customer)|buyer.*validation/i.test(message);
  const wantsLogistics = /(logistics|incoterm|eta|shipping|freight|delivery|transport|packaging)/i.test(message);
  const wantsMarginSuggestion = /(suggest|recommend).*(margin)|margin.*(suggest|recommend)/i.test(message);

  const buyerCheck = wantsBuyerValidation
    ? await evaluateBuyer(context.buyerEmail ?? "", context.customerName)
    : undefined;
  const logistics = wantsLogistics ? evaluateLogistics(combinedText) : undefined;
  const margin = wantsMarginSuggestion ? suggestMargin(context, combinedText) : undefined;

  const actions = extractActions(message, context, uploadedFile);
  const reply = buildReply(actions, context, { uploadedFile, buyerCheck, logistics, margin });

  return NextResponse.json({ reply, actions, buyerCheck, logistics, margin });
}
