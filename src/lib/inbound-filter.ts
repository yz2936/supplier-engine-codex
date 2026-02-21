import { createLlmClient, defaultProvider, LlmProvider } from "@/lib/llm-provider";

export type InboundFilterDecision = {
  accept: boolean;
  reason: string;
  mode: "llm" | "heuristic";
};

const hasProductSignal = (subject: string, bodyText: string) => {
  const s = `${subject}\n${bodyText}`.toLowerCase();
  const productTerms = /(stainless|carbon steel|alloy|pipe|tube|tubing|sheet|plate|coil|bar|angle|channel|fittings?|flange|valve|round bar|flat bar|seamless|welded)/;
  const specTerms = /(sch\s*\d+|schedule\s*\d+|\b\d+\s*(nb|mm|cm|m|in|inch|inches)\b|astm|asme|din|jis|grade\s*[0-9a-z-]+|ss\s*304|ss\s*316|qty|quantity|length|thickness|width|od|id|rfq|quotation|quote)/;
  const dimensionalPattern = /\b\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?(\s*[x×]\s*\d+(\.\d+)?)?\b/;
  const qtyPattern = /\b(qty|quantity)\b[\s:=-]*\d+/;

  let score = 0;
  if (productTerms.test(s)) score += 2;
  if (specTerms.test(s)) score += 2;
  if (dimensionalPattern.test(s)) score += 1;
  if (qtyPattern.test(s)) score += 1;
  return score >= 3;
};

const heuristicFilter = (subject: string, bodyText: string): InboundFilterDecision => {
  if (hasProductSignal(subject, bodyText)) {
    return {
      accept: true,
      reason: "Detected industrial product/specification signal.",
      mode: "heuristic"
    };
  }

  const s = `${subject}\n${bodyText}`.toLowerCase();

  const positive = /(rfq|quote|quotation|pricing|price|supply|material|stainless|steel|pipe|sheet|plate|bar|tube|tubing|qty|quantity|schedule|spec|eta|incoterm|payment terms|procurement|purchase|po\b|lead time|delivery)/;
  const noise = /(unsubscribe|newsletter|promotion|promotional|campaign|marketing|security alert|2-step verification|password reset|account activity|sale ends|offers?|webinar|event invite|coupon|discount code)/;

  const accept = positive.test(s) && !noise.test(s);
  return {
    accept,
    reason: accept ? "Procurement-like content detected by heuristic filter." : "Likely non-procurement or promotional content.",
    mode: "heuristic"
  };
};

const llmFilter = async (subject: string, bodyText: string, provider?: LlmProvider): Promise<InboundFilterDecision | null> => {
  const llm = createLlmClient(provider);
  if (!llm) return null;
  const model = process.env.INBOUND_FILTER_MODEL?.trim() || llm.model;

  const prompt = `You classify inbound emails for an industrial products sourcing platform.
Goal: keep only messages relevant to procurement workflows.
Accept if email relates to:
- RFQ, quotation, pricing, lead time, shipping/incoterm, order updates, technical specs, inventory/supply coordination
- follow-up replies tied to those workflows
Reject if:
- advertisements, newsletters, promotions, unrelated announcements, account/security notices
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
  if (hasProductSignal(subject, bodyText)) {
    return {
      accept: true,
      reason: "Accepted due to detected product/spec details.",
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
