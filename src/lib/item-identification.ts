import { z } from "zod";
import { defaultProvider, createLlmClient } from "@/lib/llm-provider";
import { parseRFQ } from "@/lib/parser";
import { ExtractedLineItem } from "@/lib/types";

const itemSchema = z.object({
  line_id: z.string(),
  source_text: z.string(),
  normalized_product_type: z.string().nullable(),
  product_family: z.string(),
  description_normalized: z.string(),
  size_primary: z.string().nullable(),
  size_secondary: z.string().nullable(),
  wall_thickness: z.string().nullable(),
  schedule: z.string().nullable(),
  pressure_class: z.string().nullable(),
  material_grade: z.string().nullable(),
  material_spec: z.string().nullable(),
  manufacturing_method: z.string().nullable(),
  end_connection: z.string().nullable(),
  facing: z.string().nullable(),
  angle: z.number().nullable(),
  radius_type: z.string().nullable(),
  standard: z.string().nullable(),
  dimensions_raw: z.string().nullable(),
  quantity: z.number().nullable(),
  quantity_unit: z.string().nullable(),
  length: z.number().nullable(),
  length_unit: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.number(),
  extraction_warnings: z.array(z.string()),
  source_location: z.string()
});

const identificationSchema = z.object({
  rfq_contains_quoteable_items: z.boolean(),
  items: z.array(itemSchema),
  ignored_lines: z.array(z.string()),
  ambiguous_lines: z.array(z.string()),
  overall_confidence: z.number()
});

export type IdentifiedRfqItem = z.infer<typeof itemSchema>;
export type ItemIdentificationResult = z.infer<typeof identificationSchema>;

const identificationPrompt = `You are implementing the “Item Identification” step for an industrial bidding tool that reads RFQ emails and extracts only the products the supplier should consider bidding on.

Goal:
Build a robust extraction and normalization pipeline that identifies relevant RFQ line items from unstructured email content and attachments-derived text. The system must detect products across pipe, tube, fittings, and valves, including varied sizes, dimensions, materials, schedules, pressure classes, end connections, standards, and quantities. The output will feed the downstream quoting workflow, so precision and explainability matter.

Business context:
Users receive messy RFQ emails from buyers. These emails may contain greetings, commercial instructions, logistics notes, certifications, boilerplate, payment terms, prior thread content, signatures, and mixed product references. We only want the actual products being requested for quote. The system should identify the relevant products and ignore everything else.

Implementation requirements:
- Accept raw RFQ email text and optional extracted attachment text.
- Detect whether the email contains quoteable product requests.
- Extract only relevant product line items.
- Normalize them into structured fields.
- Return clean JSON for downstream quote generation.
- Preserve original source text for traceability.

Supported product families:
- Pipe
- Tube / tubing
- Fittings: elbow, tee, reducer, coupling, union, cap, plug, flange, nipple, olets, bend, cross, bushing, adapter
- Valves: ball valve, gate valve, globe valve, check valve, butterfly valve, needle valve, plug valve, relief or safety valve, control valve, solenoid valve, manifold valve

Extraction rules:
- Include only genuinely quoteable products.
- Exclude delivery terms, incoterms, lead times, payment terms, certifications-only lines, documentation-only lines, thread history, contact details, and generic pricing asks without products.
- Preserve source_text for each item.
- Return exactly this JSON shape:
{
  "rfq_contains_quoteable_items": true,
  "items": [
    {
      "line_id": "string",
      "source_text": "string",
      "normalized_product_type": "string or null",
      "product_family": "string",
      "description_normalized": "string",
      "size_primary": "string or null",
      "size_secondary": "string or null",
      "wall_thickness": "string or null",
      "schedule": "string or null",
      "pressure_class": "string or null",
      "material_grade": "string or null",
      "material_spec": "string or null",
      "manufacturing_method": "string or null",
      "end_connection": "string or null",
      "facing": "string or null",
      "angle": number or null,
      "radius_type": "string or null",
      "standard": "string or null",
      "dimensions_raw": "string or null",
      "quantity": number or null,
      "quantity_unit": "string or null",
      "length": number or null,
      "length_unit": "string or null",
      "notes": "string or null",
      "confidence": 0.0,
      "extraction_warnings": [],
      "source_location": "email body|attachment text|table row"
    }
  ],
  "ignored_lines": [],
  "ambiguous_lines": [],
  "overall_confidence": 0.0
}

Return only valid JSON. Do not include markdown.`;

const productPattern = /\b(pipe|tube|tubing|valve|flange|elbow|tee|reducer|coupling|union|cap|plug|nipple|olet|bend|cross|bushing|adapter|ball valve|gate valve|globe valve|check valve|butterfly valve|needle valve|relief valve|safety valve|control valve|solenoid valve|manifold valve)\b/i;
const exclusionPattern = /\b(incoterm|lead time|shipment|shipping|delivery|payment terms|net 30|packing|packaging|certification|certificate|documentation|quote validity|thank you|regards|best regards|sincerely|phone|email|address)\b/i;
const standardPattern = /\b(?:ASTM|ASME|API|MSS|ISO|DIN|EN)\s*[A-Z0-9.-]+\b/gi;
const quantityPattern = /\b(?:qty|quantity|required|need)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(pcs|pieces|ea|each|lengths?|spools?|sets?|lots?|ft|feet|m|mm|cm|in|inch|inches|lbs|lb|kg)?\b/i;
const sizePrimaryPattern = /\b(?:dn\s*\d+|nps\s*\d+(?:\.\d+)?|(?:\d+(?:\/\d+)?(?:\.\d+)?)\s*(?:"|in|inch|inches|mm|cm))\b/i;
const reducingPattern = /\b(\d+(?:\/\d+)?(?:\.\d+)?\s*(?:"|in|inch|mm|cm)?)\s*[x*]\s*(\d+(?:\/\d+)?(?:\.\d+)?\s*(?:"|in|inch|mm|cm)?)\b/i;
const schedulePattern = /\b(?:sch(?:edule)?)[\s:-]*([0-9]{1,3}(?:s)?|xs|xxs|std)\b/i;
const pressurePattern = /\b(?:class|cl)\s*[-:]?\s*(\d{2,4})\b|\b(\d{2,4})\s*(?:lb|#)\b|\b(\d+)\s*(?:wog|cwp)\b/i;
const endConnectionPattern = /\b(fnpt|mnpt|npt|bw|butt weld|sw|socket weld|thread(?:ed)?|rf|ff|rtj|flanged)\b/i;
const manufacturingPattern = /\b(seamless|smls|welded|erw|efw|dsaw)\b/i;
const anglePattern = /\b(45|90|180)\s*(?:deg|degree)?\b/i;
const radiusPattern = /\b(lr|long radius|sr|short radius)\b/i;

const normalizeWhitespace = (text: string) =>
  text
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[’‘]/g, "'")
    .replace(/[×]/g, "x")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ");

const stripThreadNoise = (text: string) => {
  const lines = normalizeWhitespace(text).split("\n");
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      kept.push("");
      continue;
    }
    if (/^>/.test(line)) continue;
    if (/^on .+wrote:$/i.test(line)) continue;
    if (/^(from|sent|to|subject|cc|bcc|date):/i.test(line)) continue;
    if (/^(regards|best regards|thanks|thank you|sincerely),?$/i.test(line)) continue;
    if (/unsubscribe|privacy policy|terms of service|view in browser|all rights reserved/i.test(line)) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
};

const splitCandidateLines = (text: string) => stripThreadNoise(text)
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const mapExtractedLineItem = (item: ExtractedLineItem, index: number): IdentifiedRfqItem => {
  const primarySize = item.nominalSize ? `${item.nominalSize} in` : item.od ? `${item.od} in` : null;
  const standards = item.standards?.join(", ") || null;
  const productType = item.productType || item.category || null;
  const warnings: string[] = [];
  if (!item.quantity || item.quantity <= 0) warnings.push("Quantity missing or unclear");
  if (!primarySize && !item.dimensionSummary) warnings.push("Size not explicit");
  return {
    line_id: `item-${index + 1}`,
    source_text: item.sourceText || item.rawSpec,
    normalized_product_type: productType,
    product_family: item.productFamily || item.category,
    description_normalized: item.rawSpec,
    size_primary: primarySize,
    size_secondary: item.width ? `${item.width} in` : null,
    wall_thickness: item.wall ? `${item.wall} in` : null,
    schedule: item.schedule || null,
    pressure_class: item.pressureClass || null,
    material_grade: item.grade || null,
    material_spec: standards,
    manufacturing_method: item.notes?.match(/\b(seamless|smls|welded|erw|efw|dsaw)\b/i)?.[1] || null,
    end_connection: item.endType || null,
    facing: item.face || null,
    angle: item.angle ?? null,
    radius_type: item.radius || null,
    standard: standards,
    dimensions_raw: item.dimensionSummary || null,
    quantity: item.quantity || null,
    quantity_unit: item.quantityUnit || null,
    length: item.length ?? null,
    length_unit: item.length ? "in" : null,
    notes: item.notes || null,
    confidence: item.confidence ?? 0.5,
    extraction_warnings: warnings,
    source_location: "email body"
  };
};

const fallbackIdentification = async (rawText: string): Promise<ItemIdentificationResult> => {
  const candidateLines = splitCandidateLines(rawText);
  const ignoredLines: string[] = [];
  const ambiguousLines: string[] = [];

  for (const line of candidateLines) {
    if (!productPattern.test(line) || exclusionPattern.test(line)) ignoredLines.push(line);
    else if (!quantityPattern.test(line) && !sizePrimaryPattern.test(line) && !reducingPattern.test(line)) ambiguousLines.push(line);
  }

  const extracted = await parseRFQ(rawText, defaultProvider());
  const deduped = new Map<string, IdentifiedRfqItem>();

  extracted.forEach((item, index) => {
    const mapped = mapExtractedLineItem(item, index);
    const line = mapped.source_text.trim();
    if (!line || !candidateLines.some((candidate) => candidate.includes(line) || line.includes(candidate))) return;
    if (exclusionPattern.test(line)) return;
    if (!productPattern.test(line)) {
      ambiguousLines.push(line);
      return;
    }
    const key = `${mapped.product_family}|${mapped.normalized_product_type}|${mapped.source_text}`.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, mapped);
  });

  const items = Array.from(deduped.values()).map((item, index) => ({ ...item, line_id: `item-${index + 1}` }));
  return {
    rfq_contains_quoteable_items: items.length > 0,
    items,
    ignored_lines: Array.from(new Set(ignoredLines)).slice(0, 12),
    ambiguous_lines: Array.from(new Set(ambiguousLines.filter((line) => !ignoredLines.includes(line)))).slice(0, 12),
    overall_confidence: items.length
      ? Number((items.reduce((sum, item) => sum + item.confidence, 0) / items.length).toFixed(2))
      : 0
  };
};

export const identifyRfqItems = async (params: {
  emailText: string;
  attachmentText?: string;
}) => {
  const combined = [params.emailText, params.attachmentText].filter(Boolean).join("\n\n").trim();
  if (!combined) {
    return {
      rfq_contains_quoteable_items: false,
      items: [],
      ignored_lines: [],
      ambiguous_lines: [],
      overall_confidence: 0
    } satisfies ItemIdentificationResult;
  }

  const llm = createLlmClient(defaultProvider());
  if (llm) {
    try {
      const response = await llm.client.chat.completions.create({
        model: llm.model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: identificationPrompt },
          { role: "user", content: combined }
        ]
      });
      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = identificationSchema.safeParse(JSON.parse(content));
        if (parsed.success) {
          return parsed.data;
        }
      }
    } catch {
      // Fall through to deterministic parsing.
    }
  }

  return fallbackIdentification(combined);
};
