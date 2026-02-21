import { z } from "zod";
import { ExtractedLineItem } from "@/lib/types";
import { createLlmClient, LlmProvider } from "@/lib/llm-provider";
import { calcWeightFromGeometry, detectCategory, parseGaugeOrThickness, parseMeasurementInches } from "@/lib/utils";

const lineItemSchema = z.object({
  category: z.string(),
  grade: z.string(),
  finish: z.string().optional(),
  nominalSize: z.coerce.number().optional(),
  schedule: z.string().optional(),
  dimensionSummary: z.string().optional(),
  thickness: z.coerce.number().optional(),
  width: z.coerce.number().optional(),
  length: z.coerce.number().optional(),
  quantity: z.coerce.number(),
  quantityUnit: z.preprocess((v) => String(v ?? "").toLowerCase(), z.enum(["pcs", "lbs"])),
  rawSpec: z.string(),
  estimatedWeightLb: z.coerce.number().optional()
});

const responseSchema = z.array(lineItemSchema);

const finishPattern = /\b(2B|#4|BA|HRAP)\b/i;
const dimsPattern = /(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:ga|mm|cm|m|in|"))?)\s*[x×]\s*(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:mm|cm|m|in|"))?)\s*[x×]\s*(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:mm|cm|m|in|"))?)/i;

const nbMap: Record<string, number> = {
  "8": 0.25,
  "10": 0.375,
  "15": 0.5,
  "20": 0.75,
  "25": 1,
  "32": 1.25,
  "40": 1.5,
  "50": 2,
  "65": 2.5,
  "80": 3,
  "100": 4,
  "125": 5,
  "150": 6,
  "200": 8,
  "250": 10,
  "300": 12
};

const cleanInput = (text: string) =>
  text
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[×]/g, "x")
    .replace(/\t/g, " ")
    .replace(/\r/g, "")
    .trim();

const stripEmailNoise = (text: string) => {
  const lines = cleanInput(text).split("\n");
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^>/.test(line)) continue;
    if (/^on .+wrote:$/i.test(line)) continue;
    if (/^(from|sent|to|subject):/i.test(line)) continue;
    if (/^(regards|best regards|thanks|thank you|sincerely),?$/i.test(line)) continue;
    if (/unsubscribe|privacy policy|terms of service|view in browser|all rights reserved/i.test(line)) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
};

const parseGrade = (text: string) => {
  const exact = text.match(/\b(304L?|316L?|430|410|2205|duplex2205|253MA|309S?|310S?)\b/i)?.[1];
  if (exact) return exact.toUpperCase();

  const stainlessFamily = text.match(/\b\d{3}L?\b/i)?.[0];
  if (stainlessFamily) return stainlessFamily.toUpperCase();

  return "UNKNOWN";
};

const parseQuantity = (text: string) => {
  const qtyLine = text.match(/\bqty(?:uantity)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|lengths?|pcs?|pieces?)?\b/i);
  if (qtyLine) {
    const unit = (qtyLine[2] ?? "").toLowerCase();
    if (unit.startsWith("lb") || unit.startsWith("pound")) return { quantity: Number(qtyLine[1]), quantityUnit: "lbs" as const };
    return { quantity: Number(qtyLine[1]), quantityUnit: "pcs" as const };
  }

  const lbs = text.match(/\b(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i);
  if (lbs) return { quantity: Number(lbs[1]), quantityUnit: "lbs" as const };

  const lengths = text.match(/\b(\d+(?:\.\d+)?)\s*(?:lengths|pcs?|pieces)\b/i);
  if (lengths) return { quantity: Number(lengths[1]), quantityUnit: "pcs" as const };

  const parenMeters = text.match(/\((\d+(?:\.\d+)?)\s*(?:mtrs?|meters?)\)/i);
  if (parenMeters) return { quantity: Number(parenMeters[1]), quantityUnit: "pcs" as const };

  return { quantity: 1, quantityUnit: "pcs" as const };
};

const parseLength = (text: string) => {
  const explicit = text.match(/\blength\s*[:=]?\s*(\d+(?:\.\d+)?\s*(?:mm|cm|m|in|"))\b/i)?.[1];
  if (explicit) return parseMeasurementInches(explicit);

  const trailing = text.match(/\b(\d+(?:\.\d+)?)\s*(mm|cm|mtrs?|meters?|in|")\s*long\b/i);
  if (trailing) return parseMeasurementInches(`${trailing[1]} ${trailing[2]}`);

  return undefined;
};

const parseNominalSize = (text: string) => {
  const nb = text.match(/\b(\d{2,3})\s*nb\b/i)?.[1];
  if (nb && nbMap[nb]) return nbMap[nb];

  const nps = text.match(/\b(?:nps|dn)\s*(\d+(?:\.\d+)?)\b/i)?.[1];
  if (nps) return Number(nps);

  return undefined;
};

const parseSchedule = (text: string) => {
  const hit = text.match(/\b(?:sch(?:edule)?)[\s:-]*(\d{1,3}(?:s)?)\b/i)?.[1];
  return hit ? hit.toUpperCase() : undefined;
};

const inferBlocks = (text: string) => {
  const lines = cleanInput(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const isBoundary = /^\d+[).]|^-|^item\b|^line\b/i.test(line);
    const isNoise = /\b(please offer|earliest eta|packed for|fob|confirm|thanks|regards)\b/i.test(line);

    if (isBoundary && current.length) {
      blocks.push(current.join(" "));
      current = [];
    }

    if (!isNoise || /\b(size|qty|length|schedule|grade|pipe|sheet|plate|bar|tube|tubing)\b/i.test(line)) {
      current.push(line);
    }
  }

  if (current.length) blocks.push(current.join(" "));

  if (!blocks.length && lines.length) {
    blocks.push(lines.join(" "));
  }

  return blocks;
};

const hasItemSignal = (line: string) =>
  /(pipe|sheet|plate|bar|tube|tubing|coil|fitting|angle|channel|sch\s*\d+|schedule\s*\d+|\d+\s*nb|\d+ga|x|qty|grade|stainless)/i.test(line);

const hasProductCategorySignal = (line: string) =>
  /(pipe|tube|tubing|sheet|plate|coil|bar|rod|angle|channel|fitting|elbow|tee|reducer|stainless)/i.test(line);

const hasDimensionSignal = (line: string) =>
  /(\d+\s*[x×]\s*\d+|\d+ga|\d+\s*nb|sch(?:edule)?\s*\d+|length\s*[:=]?\s*\d|\d+\s*(mm|cm|m|in|"))/i.test(line);

const buildDimensionSummary = (
  category: string,
  attrs: { thickness?: number; width?: number; length?: number; nominalSize?: number; schedule?: string }
) => {
  const c = category.toLowerCase();
  const fmt = (n?: number) => (Number.isFinite(n) ? `${n}` : undefined);

  if (/pipe|tube|tubing/.test(c)) {
    const parts = [
      attrs.nominalSize ? `NPS/NB ${attrs.nominalSize}` : undefined,
      attrs.schedule ? `SCH ${attrs.schedule}` : undefined,
      attrs.thickness ? `WT ${fmt(attrs.thickness)} in` : undefined,
      attrs.length ? `L ${fmt(attrs.length)} in` : undefined
    ].filter(Boolean);
    return parts.join(" | ");
  }

  if (/sheet|plate|coil/.test(c)) {
    const parts = [
      attrs.thickness ? `T ${fmt(attrs.thickness)} in` : undefined,
      attrs.width ? `W ${fmt(attrs.width)} in` : undefined,
      attrs.length ? `L ${fmt(attrs.length)} in` : undefined
    ].filter(Boolean);
    return parts.join(" x ");
  }

  if (/bar|angle|channel/.test(c)) {
    const parts = [
      attrs.thickness ? `T ${fmt(attrs.thickness)} in` : undefined,
      attrs.width ? `W ${fmt(attrs.width)} in` : undefined,
      attrs.length ? `L ${fmt(attrs.length)} in` : undefined
    ].filter(Boolean);
    return parts.join(" | ");
  }

  return [
    attrs.thickness ? `T ${fmt(attrs.thickness)} in` : undefined,
    attrs.width ? `W ${fmt(attrs.width)} in` : undefined,
    attrs.length ? `L ${fmt(attrs.length)} in` : undefined
  ].filter(Boolean).join(" | ");
};

const isSpecificProductItem = (item: ExtractedLineItem) => {
  const raw = item.rawSpec || "";
  if (!hasProductCategorySignal(raw)) return false;
  if (!(hasDimensionSignal(raw) || item.thickness || item.width || item.length || item.schedule || item.nominalSize)) return false;
  if (!item.quantity || item.quantity <= 0) return false;
  return true;
};

const parseBlock = (block: string): ExtractedLineItem => {
  const finish = block.match(finishPattern)?.[1]?.toUpperCase();
  const grade = parseGrade(block);
  const category = detectCategory(block);
  const quantity = parseQuantity(block);
  const schedule = parseSchedule(block);
  const nominalSize = parseNominalSize(block);

  let thickness: number | undefined;
  let width: number | undefined;
  let length: number | undefined;

  const dims = block.match(dimsPattern);
  if (dims) {
    thickness = parseGaugeOrThickness(dims[1]) ?? parseMeasurementInches(dims[1]);
    width = parseMeasurementInches(dims[2]);
    length = parseMeasurementInches(dims[3]);
  }

  if (!length) {
    length = parseLength(block);
  }

  if (!width && /\b(pipe|tub(e|ing)|schedule|sch)\b/i.test(block)) {
    width = nominalSize;
  }

  if (!thickness) {
    const directThickness = block.match(/\b(\d+ga|\d+\/\d+|\d*\.\d{2,4})(?:\s*(mm|cm|in|"))?\b/i);
    if (directThickness) {
      thickness = parseGaugeOrThickness(directThickness[1]) ?? parseMeasurementInches(`${directThickness[1]} ${directThickness[2] ?? ""}`.trim());
    }
  }

  const estimatedWeightLb = thickness && width && length && quantity.quantityUnit === "pcs"
    ? calcWeightFromGeometry(thickness, width, length, quantity.quantity)
    : undefined;

  return {
    category,
    grade,
    finish,
    nominalSize,
    schedule,
    dimensionSummary: buildDimensionSummary(category, { thickness, width, length, nominalSize, schedule }),
    thickness,
    width,
    length,
    quantity: quantity.quantity,
    quantityUnit: quantity.quantityUnit,
    rawSpec: block,
    estimatedWeightLb
  } satisfies ExtractedLineItem;
};

const heuristicParse = (text: string): ExtractedLineItem[] => {
  const blocks = inferBlocks(text);

  const items = blocks
    .filter((b) => hasItemSignal(b))
    .map((block) => parseBlock(block));

  return items.length ? items : [{
    category: "Unknown",
    grade: "UNKNOWN",
    quantity: 1,
    quantityUnit: "pcs",
    rawSpec: cleanInput(text)
  }];
};

const normalizeExtracted = (items: ExtractedLineItem[]) => {
  const normalized = items.map((item) => {
    const rawParsed = parseBlock(item.rawSpec || "");
    const clean: ExtractedLineItem = {
      category: item.category || rawParsed.category || detectCategory(item.rawSpec),
      grade: (item.grade || rawParsed.grade || "UNKNOWN").toUpperCase(),
      finish: item.finish?.toUpperCase(),
      nominalSize: item.nominalSize ?? rawParsed.nominalSize,
      schedule: item.schedule ?? rawParsed.schedule,
      dimensionSummary: item.dimensionSummary ?? rawParsed.dimensionSummary,
      thickness: item.thickness ?? rawParsed.thickness,
      width: item.width ?? rawParsed.width,
      length: item.length ?? rawParsed.length,
      quantity: Math.max(1, Number(item.quantity || rawParsed.quantity || 1)),
      quantityUnit: item.quantityUnit === "lbs" ? "lbs" : "pcs",
      rawSpec: item.rawSpec || "",
      estimatedWeightLb: item.estimatedWeightLb
    };

    if (!clean.category || clean.category === "Unknown") {
      clean.category = detectCategory(clean.rawSpec);
    }

    if (/\bqty(?:uantity)?\s*[:=]?/i.test(clean.rawSpec) && rawParsed.quantity > 0 && Math.abs(clean.quantity - rawParsed.quantity) >= 1) {
      clean.quantity = rawParsed.quantity;
      clean.quantityUnit = rawParsed.quantityUnit;
    }

    if (/\b(mm|cm|mtrs?|meters?)\b/i.test(clean.rawSpec) && clean.length && clean.length > 500) {
      clean.length = rawParsed.length ?? clean.length;
    }

    if (!clean.width && rawParsed.width) clean.width = rawParsed.width;
    if (!clean.thickness && rawParsed.thickness) clean.thickness = rawParsed.thickness;
    if (!clean.dimensionSummary) {
      clean.dimensionSummary = buildDimensionSummary(clean.category, {
        thickness: clean.thickness,
        width: clean.width,
        length: clean.length,
        nominalSize: clean.nominalSize,
        schedule: clean.schedule
      });
    }

    if (!clean.estimatedWeightLb && clean.quantityUnit === "pcs" && clean.thickness && clean.width && clean.length) {
      clean.estimatedWeightLb = calcWeightFromGeometry(clean.thickness, clean.width, clean.length, clean.quantity);
    }

    return clean;
  });

  const specific = normalized.filter((i) => i.rawSpec.trim().length > 0 && isSpecificProductItem(i));
  return specific;
};

const llmParse = async (text: string, provider?: LlmProvider) => {
  const llm = createLlmClient(provider);
  if (!llm) return null;
  const cleanedForModel = stripEmailNoise(text);
  const prompt = `You are an industrial stainless steel RFQ extraction engine.
Return strict JSON object with key: "items" (array).
Each item fields:
category, grade, finish, nominalSize, schedule, dimensionSummary, thickness, width, length, quantity, quantityUnit, rawSpec, estimatedWeightLb.
Rules:
- Handle messy multi-line email text and group lines into line items.
- Ignore signatures, greetings, disclaimers, unsubscribe/footer text, and quoted older email thread content.
- Return only concrete purchasable product lines; skip generic sentences.
- Convert gauges to decimal inches.
- Convert metric dims to inches when possible (mm/cm/m).
- Recognize pipe strings like "32NB SCH40 length 6000mm qty 22 lengths".
- Preserve the exact technical snippet per line item in rawSpec.
- quantityUnit must be pcs or lbs.
- If uncertain, keep best-effort values but include rawSpec.
- Do not include commentary; JSON only.`;

  const response = await llm.client.chat.completions.create({
    model: llm.model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: cleanedForModel || cleanInput(text) }
    ],
    temperature: 0
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return null;

  const parsedJson = JSON.parse(content) as { items?: unknown };
  const rawItems = Array.isArray(parsedJson.items) ? parsedJson.items : null;
  if (!rawItems) return null;

  const parsed = responseSchema.safeParse(rawItems);
  if (!parsed.success) return null;

  return normalizeExtracted(parsed.data);
};

export const parseRFQ = async (text: string, provider?: LlmProvider): Promise<ExtractedLineItem[]> => {
  const cleaned = cleanInput(text);

  if (createLlmClient(provider)) {
    try {
      const items = await llmParse(cleaned, provider);
      if (items && items.length) return items;
    } catch {
      // Fallback to deterministic parser below.
    }
  }

  return normalizeExtracted(heuristicParse(cleaned));
};
