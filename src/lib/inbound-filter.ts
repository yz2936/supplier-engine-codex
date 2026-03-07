import { createLlmClient, defaultProvider, LlmProvider } from "@/lib/llm-provider";

export type InboundFilterDecision = {
  accept: boolean;
  reason: string;
  mode: "llm" | "heuristic";
};

const normalize = (subject: string, bodyText: string) => `${subject}\n${bodyText}`.toLowerCase();

const productSignalScore = (s: string) => {
  const productTerms = /\b(stainless|carbon steel|alloy|pipe|tube|tubing|sheet|plate|coil|bar|angle|channel|fittings?|flange|valve|gasket|elbow|tee|reducer|cap|coupling|union|nipple|olet|round bar|flat bar|seamless|welded)\b/;
  const specTerms = /\b(sch\s*\d+|schedule\s*\d+|\d+\s*(nb|nps|dn|mm|cm|m|in|inch|inches)\b|astm|asme|din|jis|api|mss|grade\s*[0-9a-z-]+|class\s*\d+|cl\s*\d+|ss\s*304|ss\s*316|qty|quantity|length|thickness|width|od|id|wall|rfq|quotation|quote)\b/;
  const dimensionalPattern = /\b\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?(\s*[x×]\s*\d+(\.\d+)?)?\b/;
  const qtyPattern = /\b(qty|quantity|need|requirement)\b[\s:=-]*\d*/;

  let score = 0;
  if (productTerms.test(s)) score += 2;
  if (specTerms.test(s)) score += 2;
  if (dimensionalPattern.test(s)) score += 1;
  if (qtyPattern.test(s)) score += 1;
  return score;
};

const hasBuySideIntent = (s: string) => {
  const directBuyIntent = /\b(rfq|request for quote|quote(?:\s+for)?|quotation|please quote|can you quote|pricing request|budgetary quote|submit(?:\s+your)?\s+quote|bid|bidding|tender|sourcing request|source this|procurement|purchase request|po\b|order|need pricing|need quote|looking for|seeking supplier|material request)\b/;
  const logisticsTerms = /\b(lead time|eta|delivery|ship(?:ping)?|incoterm|payment terms|origin|destination|mill test report|mtr|packing)\b/;
  return directBuyIntent.test(s) || (logisticsTerms.test(s) && productSignalScore(s) >= 3);
};

const hasNegativeSalesSignal = (s: string) => {
  const advertisements = /\b(unsubscribe|newsletter|promotion|promotional|campaign|marketing|coupon|discount|sale ends|limited time|special offer|webinar|event invite|expo|booth|catalog|brochure|price list attached|new product launch)\b/;
  const inboundSales = /\b(we are (a|an)?\s*(manufacturer|supplier|stockist|exporter)|we can supply|we supply|we offer|introduce our company|glad to introduce|please find our company profile|looking for buyers|be your supplier|sell to you|stock available|ready stock|our products include)\b/;
  const accountNoise = /\b(security alert|2-step verification|password reset|account activity|verify your email|invoice overdue|subscription)\b/;
  return advertisements.test(s) || inboundSales.test(s) || accountNoise.test(s);
};

const hasReplyContext = (s: string) => {
  const replyMarkers = /\b(re:|fw:|fwd:|follow up|following up|as discussed|per your request)\b/;
  const procurementThreadTerms = /\b(rfq|quote|quotation|pricing|lead time|delivery|material|spec|grade|size|qty|quantity)\b/;
  return replyMarkers.test(s) && procurementThreadTerms.test(s);
};

const hasProductSignal = (subject: string, bodyText: string) => {
  const s = normalize(subject, bodyText);
  return productSignalScore(s) >= 3;
};

const heuristicFilter = (subject: string, bodyText: string): InboundFilterDecision => {
  const s = normalize(subject, bodyText);
  const productScore = productSignalScore(s);
  const buySideIntent = hasBuySideIntent(s);
  const negativeSalesSignal = hasNegativeSalesSignal(s);
  const replyContext = hasReplyContext(s);

  if (negativeSalesSignal) {
    return {
      accept: false,
      reason: "Rejected as advertisement, inbound sales outreach, or account-related noise.",
      mode: "heuristic"
    };
  }

  if (productScore >= 3 && (buySideIntent || replyContext)) {
    return {
      accept: true,
      reason: "Detected industrial sourcing request with buy-side procurement intent.",
      mode: "heuristic"
    };
  }

  return {
    accept: false,
    reason: "Missing clear industrial sourcing intent or technical buying context.",
    mode: "heuristic"
  };
};

const llmFilter = async (subject: string, bodyText: string, provider?: LlmProvider): Promise<InboundFilterDecision | null> => {
  const llm = createLlmClient(provider);
  if (!llm) return null;
  const model = process.env.INBOUND_FILTER_MODEL?.trim() || llm.model;

  const prompt = `You classify inbound emails for an industrial products sourcing platform.
Goal: keep only buy-side industrial sourcing requests that a sales team should quote or bid on.
Accept if email relates to:
- RFQ, quotation, bidding, pricing request, lead time, shipping/incoterm, technical specs, inventory/supply coordination for industrial products
- follow-up replies clearly tied to those workflows
Reject if:
- advertisements, newsletters, promotions, vendor introductions, inbound sales outreach, unrelated announcements, account/security notices
- emails from suppliers trying to sell products unless they are directly responding to an active quote or request
Return strict JSON with:
{ "accept": boolean, "reason": string }`;

  const response = await llm.client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: JSON.stringify({
          subject: subject.slice(0, 500),
          bodyText: bodyText.slice(0, 6000)
        })
      }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return null;
  const parsed = JSON.parse(content) as { accept?: unknown; reason?: unknown };
  if (typeof parsed.accept !== "boolean") return null;

  return {
    accept: parsed.accept,
    reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "LLM inbound filter decision.",
    mode: "llm"
  };
};

export const filterInboundEmail = async (subject: string, bodyText: string): Promise<InboundFilterDecision> => {
  const s = normalize(subject, bodyText);
  if (hasNegativeSalesSignal(s)) {
    return {
      accept: false,
      reason: "Rejected as advertisement, inbound sales outreach, or account-related noise.",
      mode: "heuristic"
    };
  }

  if (hasProductSignal(subject, bodyText) && (hasBuySideIntent(s) || hasReplyContext(s))) {
    return {
      accept: true,
      reason: "Accepted due to industrial product/spec details and clear sourcing intent.",
      mode: "heuristic"
    };
  }

  const enabled = String(process.env.INBOUND_LLM_FILTER ?? "true").toLowerCase() !== "false";
  const provider = defaultProvider();

  if (enabled) {
    try {
      const decision = await llmFilter(subject, bodyText, provider);
      if (decision) return decision;
    } catch {
      // fall through to heuristic
    }
  }

  return heuristicFilter(subject, bodyText);
};
