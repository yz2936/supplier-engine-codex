import { z } from "zod";
import { ExtractedLineItem, QuantityUnit } from "@/lib/types";
import { createLlmClient, LlmProvider } from "@/lib/llm-provider";
import { calcWeightFromGeometry, detectCategory, parseGaugeOrThickness, parseMeasurementInches } from "@/lib/utils";

const quantityUnits = ["pcs", "pieces", "ea", "each", "lengths", "spools", "sets", "lot", "lbs", "kg", "ft", "m", "unknown"] as const;

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

const nullableString = z.union([z.string(), z.null()]).transform((value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
});

const stringArray = z.array(z.string()).catch([]);

const parserResponseSchema = z.object({
  rfq_summary: z.object({
    document_type: nullableString.catch("unknown"),
    detected_industry_context: nullableString.catch("unknown"),
    overall_notes: stringArray
  }).catch({
    document_type: "unknown",
    detected_industry_context: "unknown",
    overall_notes: []
  }),
  line_items: z.array(z.object({
    line_id: z.string().catch(""),
    product_family: nullableString.catch("unknown"),
    product_type: nullableString.catch(null),
    description_normalized: z.string().catch(""),
    quantity: z.union([z.number(), z.null()]).catch(null),
    quantity_uom: nullableString.catch(null),
    material_grade: z.object({
      base_material: nullableString.catch(null),
      grade: nullableString.catch(null),
      alloy: nullableString.catch(null),
      astm_asme_material_spec: stringArray,
      nace: nullableString.catch(null),
      liner_or_trim_material: nullableString.catch(null)
    }).catch({
      base_material: null,
      grade: null,
      alloy: null,
      astm_asme_material_spec: [],
      nace: null,
      liner_or_trim_material: null
    }),
    dimensions: z.object({
      nominal_size: nullableString.catch(null),
      size_1: nullableString.catch(null),
      size_2: nullableString.catch(null),
      od: nullableString.catch(null),
      id: nullableString.catch(null),
      wall_thickness: nullableString.catch(null),
      schedule: nullableString.catch(null),
      length: nullableString.catch(null),
      thickness: nullableString.catch(null)
    }).catch({
      nominal_size: null,
      size_1: null,
      size_2: null,
      od: null,
      id: null,
      wall_thickness: null,
      schedule: null,
      length: null,
      thickness: null
    }),
    pressure_temperature_rating: z.object({
      pressure_class: nullableString.catch(null),
      pressure_rating: nullableString.catch(null),
      temperature_rating: nullableString.catch(null)
    }).catch({
      pressure_class: null,
      pressure_rating: null,
      temperature_rating: null
    }),
    end_connections: stringArray,
    manufacturing_details: z.object({
      seamless_or_welded: nullableString.catch(null),
      fabrication: nullableString.catch(null),
      ends: nullableString.catch(null),
      bore: nullableString.catch(null),
      operator: nullableString.catch(null)
    }).catch({
      seamless_or_welded: null,
      fabrication: null,
      ends: null,
      bore: null,
      operator: null
    }),
    standards: z.object({
      dimensional_standards: stringArray,
      material_standards: stringArray,
      testing_standards: stringArray,
      compliance_requirements: stringArray
    }).catch({
      dimensional_standards: [],
      material_standards: [],
      testing_standards: [],
      compliance_requirements: []
    }),
    commercial_notes: stringArray,
    source_text: z.string().catch(""),
    parsing_notes: stringArray,
    confidence: z.number().catch(0)
  })).catch([])
});

const finishPattern = /\b(2B|#4|BA|HRAP)\b/i;
const dimsPattern = /(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:ga|mm|cm|m|in|"))?)\s*[x]\s*(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:mm|cm|m|in|"))?)\s*[x]\s*(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:mm|cm|m|in|"))?)/i;
const twoDimsPattern = /(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:ga|mm|cm|m|in|"))?)\s*[x]\s*(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:mm|cm|m|in|"))?)/i;

const exactPrompt = `You are an expert industrial procurement document parser specializing in PVF products: pipe, valves, fittings, flanges, tubing, and related line items.

Your task is to extract structured product data from messy RFQ text, including:
- product type
- product category
- material / grade
- dimensions
- quantity
- unit of measure
- pressure class / schedule / rating
- standard / specification
- end connection
- notes
- source text span
- confidence

The input may be:
- poorly formatted emails
- pasted tables with broken alignment
- OCR-like text
- abbreviations
- inconsistent units
- multiple products on one line
- missing fields
- duplicate references
- noisy commercial terms mixed with technical requirements

You must parse only what is actually supported by the text. Do not hallucinate. If a field is unclear, set it to null and explain uncertainty in notes.

--------------------------------------------------
PRIMARY OBJECTIVE
--------------------------------------------------

From the provided RFQ text, identify each distinct requested product line and return a clean JSON array of line items.

Each line item should preserve the original commercial intent while normalizing technical details where possible.

The parser must be highly accurate for industrial PVF procurement language.

--------------------------------------------------
PRODUCT FAMILIES TO RECOGNIZE
--------------------------------------------------

Recognize at minimum these product families and classify them correctly:

1. Pipe
2. Tube / Tubing
3. Valve
   - ball valve
   - gate valve
   - globe valve
   - check valve
   - butterfly valve
   - plug valve
   - needle valve
   - safety / relief valve
   - control valve
   - actuator package if explicitly requested
4. Fittings
   - elbow
   - tee
   - reducer
   - coupling
   - union
   - cap
   - plug
   - bushing
   - nipple
   - swage nipple
   - weldolet / sockolet / threadolet / olet
   - cross
   - return bend
5. Flanges
   - weld neck
   - slip on
   - socket weld
   - threaded
   - blind
   - lap joint
   - spectacle blind
   - spacer / spade
6. Gasket / bolting only if clearly requested
7. Ancillary piping items if explicit
   - strainer
   - sight glass
   - expansion joint
   - hose
   - instrument manifold

--------------------------------------------------
FIELDS TO EXTRACT
--------------------------------------------------

Return JSON with this exact structure:

{
  "rfq_summary": {
    "document_type": "rfq|email|quote request|bid package|unknown",
    "detected_industry_context": "oil_and_gas|chemical|power|water|general_industrial|unknown",
    "overall_notes": []
  },
  "line_items": [
    {
      "line_id": "string",
      "product_family": "pipe|tube|valve|fitting|flange|gasket|bolting|ancillary|unknown",
      "product_type": "string or null",
      "description_normalized": "string",
      "quantity": number or null,
      "quantity_uom": "ea|pcs|piece|ft|m|lengths|spools|sets|unknown|null",
      "material_grade": {
        "base_material": "string or null",
        "grade": "string or null",
        "alloy": "string or null",
        "astm_asme_material_spec": ["string"],
        "nace": "string or null",
        "liner_or_trim_material": "string or null"
      },
      "dimensions": {
        "nominal_size": "string or null",
        "size_1": "string or null",
        "size_2": "string or null",
        "od": "string or null",
        "id": "string or null",
        "wall_thickness": "string or null",
        "schedule": "string or null",
        "length": "string or null",
        "thickness": "string or null"
      },
      "pressure_temperature_rating": {
        "pressure_class": "string or null",
        "pressure_rating": "string or null",
        "temperature_rating": "string or null"
      },
      "end_connections": ["string"],
      "manufacturing_details": {
        "seamless_or_welded": "seamless|welded|erw|efw|dsaw|unknown|null",
        "fabrication": "string or null",
        "ends": "beveled|plain_end|threaded|grooved|socket_weld|buttweld|flanged|null",
        "bore": "full_port|reduced_port|unknown|null",
        "operator": "lever|gear|actuated|manual|handwheel|unknown|null"
      },
      "standards": {
        "dimensional_standards": ["string"],
        "material_standards": ["string"],
        "testing_standards": ["string"],
        "compliance_requirements": ["string"]
      },
      "commercial_notes": ["string"],
      "source_text": "exact relevant source snippet",
      "parsing_notes": ["string"],
      "confidence": 0.0
    }
  ]
}

--------------------------------------------------
EXTRACTION RULES
--------------------------------------------------

1. SPLIT DISTINCT LINE ITEMS CORRECTLY
- One line in the source may contain multiple products.
- One product may span multiple broken lines.
- Create a separate line item for each distinct requested item.
- If quantity applies to a group of otherwise identical products, keep one item unless sizes differ.

2. DO NOT INVENT MISSING DATA
- If a grade, dimension, quantity, or standard is not clearly supported, return null.
- Never infer stainless grade from context alone.
- Never assume SCH 40 if only thickness is absent.
- Never assume valve type from rating alone.

3. PRESERVE RAW MEANING, NORMALIZE CAREFULLY
Normalize common terms:
- SS -> stainless steel
- CS -> carbon steel
- BW -> butt weld
- SW -> socket weld
- THD / NPT -> threaded / NPT
- WN -> weld neck
- SO -> slip on
- BL -> blind
- RF -> raised face
- RTJ -> ring type joint
- FIG -> figure
- SCH -> schedule
- CL150 / 150LB / 150# -> Class 150
- XXS / XS / STD -> keep exactly if present
- ASTM A312 TP316/316L -> capture as material spec and grade
- A105 / LF2 / F304 / F316 / WPB / WP304 / WP316 -> capture exactly

4. PIPE / TUBE PARSING
Extract where available:
- nominal size (example: 2", 6", NPS 4)
- schedule (SCH 10S, 40, 80, XS)
- wall thickness
- length (20 ft, random length, SRL, DRL)
- seamless/welded
- material spec (ASTM A312, A106, API 5L, etc.)
- grade (316L, A53 Gr B, X52, Duplex 2205)

5. VALVE PARSING
Extract where available:
- valve type
- size
- pressure class / psi / WOG / CWP
- body material
- trim / seat material
- end connection
- bore
- actuation / operator
- fire safe / API 607 / NACE / fugitive emissions if stated
- standard (API 6D, API 608, API 600, ASME B16.34, MSS SP-110, etc.)

6. FITTING / FLANGE PARSING
Extract where available:
- fitting type
- reducing sizes
- angle for elbows
- LR / SR
- concentric vs eccentric reducer
- branch size
- material
- schedule / wall
- pressure class
- face type
- standard (ASME B16.9, B16.11, B16.5, MSS SP-97, etc.)

7. STANDARDS HANDLING
Recognize and separate:
- material standard: ASTM / ASME material specs
- dimensional standard: ASME B16.x, MSS SP, API dimensional rules
- testing standard: API 598, hydrotest, NDE, PMI, etc.
- compliance: NACE MR0175, PED, ISO, sour service, fire safe, low temp

8. QUANTITY HANDLING
Normalize quantity carefully:
- "10 pcs" => quantity 10, uom pcs
- "500 ft" => quantity 500, uom ft
- "20 lengths" => quantity 20, uom lengths
- "1 lot" => quantity 1, uom lot if absolutely necessary, otherwise note ambiguity
- If no quantity appears, set null
- If text says “as required” or “TBD”, set quantity null and mention in notes

9. SOURCE TEXT
For each parsed line item, include the smallest exact source snippet that supports the extraction.

10. CONFIDENCE SCORING
Use:
- 0.90 to 1.00 when type, size, grade, and quantity are explicit
- 0.70 to 0.89 when key fields are clear but some supporting specs are partial
- 0.40 to 0.69 when item is partially recoverable
- below 0.40 only if item likely exists but is highly ambiguous

--------------------------------------------------
MESSY RFQ BEHAVIOR
--------------------------------------------------

You must handle:
- columns that have shifted
- OCR mistakes like “316 1” instead of “316L”
- duplicated item lines
- headers appearing inside body text
- emails that mix commercial and technical details
- bullet lists with inconsistent punctuation
- abbreviations like:
  - 2" 316L SMLS SCH 40S A312 TP316L
  - 1-1/2" BV 1000 WOG SS NPT
  - 6 x 4 BW CONC RED SCH 40S WPB
  - 3" 150# WN RF A105
- partial lines continued on next line
- dimensions written like:
  - 2”
  - 2 in
  - 2 inch
  - DN50
  - 60.3 mm
- reducing sizes written like:
  - 6 x 4
  - 6" x 4"
  - 6 to 4
  - 6*4

--------------------------------------------------
NORMALIZATION GUIDE
--------------------------------------------------

Normalize product descriptions into concise industrial language.

Examples:
- Raw: "2in ss pipe 316l sch 40s smls astm a312 tp316l qty 6 lengths"
- Normalized: "2 in seamless stainless steel pipe, ASTM A312 TP316L, Sch 40S"

- Raw: "1 1/2 ball valve ss 1000wog fnpt"
- Normalized: "1-1/2 in stainless steel ball valve, 1000 WOG, FNPT"

- Raw: "6 x 4 ecc red bw a234 wpb sch40"
- Normalized: "6 x 4 in eccentric reducer, butt weld, ASTM A234 WPB, Sch 40"

--------------------------------------------------
IMPORTANT DOMAIN RULES
--------------------------------------------------

Use domain knowledge, but only to structure what is present.

Examples:
- ASTM A312 usually corresponds to stainless steel pipe, but do not assign 316L unless explicitly stated.
- A234 WPB usually indicates carbon steel wrought buttweld fittings, but keep the exact spec as written.
- A105 usually indicates forged carbon steel flanges/fittings, but do not convert item family unless context supports it.
- Class 150 and Sch 40 are different fields; do not mix them.
- 1000 WOG is a valve pressure rating, not a flange class.
- 10S / 40S apply typically to stainless pipe schedules; preserve as written.
- “RF” is a flange face, not always a standalone product type.
- “trim 8”, “PTFE seat”, “gear operator”, “NACE MR0175”, “fire safe” should remain in notes or detailed fields if present.

--------------------------------------------------
OUTPUT REQUIREMENTS
--------------------------------------------------

Return only valid JSON.
Do not include markdown fences.
Do not include explanations outside the JSON.
Do not omit keys.
Use null for unknown scalar fields.
Use [] for unknown list fields.
Do not collapse multiple distinct items into one.

--------------------------------------------------
QUALITY CHECK BEFORE RETURNING
--------------------------------------------------

Before returning:
1. Verify every line item has a product_family.
2. Verify quantity is numeric when present.
3. Verify standards are not mixed with dimensions.
4. Verify schedule is not placed in pressure class.
5. Verify valve WOG/CWP ratings are not treated as flange class.
6. Verify source_text exists for every line item.
7. Verify confidence reflects ambiguity.
8. Verify no unsupported assumptions were made.

Return only valid JSON.`;

const normalizeQuantityUnit = (unitRaw?: string | null): QuantityUnit => {
  const unit = String(unitRaw ?? "").toLowerCase().trim();
  if (!unit) return "unknown";
  if (unit === "piece") return "pieces";
  if (unit === "pcs" || unit === "pc") return "pcs";
  if (unit === "pieces") return "pieces";
  if (unit === "ea" || unit === "each") return unit as QuantityUnit;
  if (unit.startsWith("length")) return "lengths";
  if (unit.startsWith("spool")) return "spools";
  if (unit.startsWith("set")) return "sets";
  if (unit === "lot") return "lot";
  if (unit.startsWith("lb") || unit.startsWith("pound")) return "lbs";
  if (unit === "kg" || unit.startsWith("kilogram")) return "kg";
  if (unit === "ft" || unit.startsWith("foot") || unit.startsWith("feet")) return "ft";
  if (unit === "m" || unit.startsWith("meter") || unit.startsWith("mtr")) return "m";
  return quantityUnits.includes(unit as (typeof quantityUnits)[number]) ? unit as QuantityUnit : "unknown";
};

const normalizeGrade = (parts: Array<string | null | undefined>, fallbackSource: string) => {
  const hit = parts.find((part) => part && part.trim());
  if (hit) return hit.trim().toUpperCase();
  const explicit = fallbackSource.match(/\b(304L?|316L?|430|410|2205|2507|625|825|A105|LF2|WPB|WP304|WP304L|WP316|WP316L|F304|F304L|F316|F316L|A234\s*WPB|A312\s*TP\d{3}L?)\b/i)?.[1];
  return explicit ? explicit.toUpperCase().replace(/\s+/g, " ") : "UNKNOWN";
};

const normalizeFamily = (family?: string | null, type?: string | null, source?: string) => {
  const combined = [family, type, source].filter(Boolean).join(" ").toLowerCase();
  if (/pipe/.test(combined)) return "Pipe";
  if (/tube|tubing/.test(combined)) return "Tube";
  if (/valve/.test(combined)) return "Valve";
  if (/flange/.test(combined)) return "Flange";
  if (/gasket/.test(combined)) return "Gasket";
  if (/bolting|bolt|stud/.test(combined)) return "Bolting";
  if (/strainer|sight glass|expansion joint|hose|manifold/.test(combined)) return "Ancillary";
  if (/fitting|elbow|tee|reducer|coupling|union|cap|plug|bushing|nipple|olet|cross|bend/.test(combined)) return "Fitting";
  return detectCategory(source || type || family || "Unknown");
};

const parseNominalSize = (value?: string | null) => {
  if (!value) return undefined;
  const dn = value.match(/\bdn\s*(\d+(?:\.\d+)?)\b/i)?.[1];
  if (dn) {
    const mm = Number(dn);
    if (Number.isFinite(mm) && mm > 0) return Number((mm / 25.4).toFixed(3));
  }
  const parsed = parseMeasurementInches(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseSchedule = (value?: string | null, source?: string) => {
  const hit = value || source?.match(/\b(?:sch(?:edule)?)[\s:-]*([0-9]{1,3}(?:s)?|xs|xxs|std)\b/i)?.[1];
  return hit ? hit.toUpperCase().replace(/^SCH\s*/i, "") : undefined;
};

const parsePressureClass = (value?: string | null, rating?: string | null, source?: string) => {
  const joined = [value, rating, source].filter(Boolean).join(" ");
  const classHit = joined.match(/\b(?:class|cl)\s*[-:]?\s*(\d{2,4})\b/i)?.[1];
  if (classHit) return `Class ${classHit}`;
  const poundHit = joined.match(/\b(\d{2,4})\s*(?:lb|#)\b/i)?.[1];
  if (poundHit) return `Class ${poundHit}`;
  const wogHit = joined.match(/\b\d+\s*(?:wog|cwp)\b/i)?.[0];
  if (wogHit) return wogHit.toUpperCase().replace(/\s+/g, " ");
  return undefined;
};

const parseEndConnections = (line: z.infer<typeof parserResponseSchema>["line_items"][number]) => {
  const set = new Set<string>();
  for (const entry of line.end_connections) {
    const text = entry.trim();
    if (text) set.add(text);
  }
  if (line.manufacturing_details.ends) set.add(line.manufacturing_details.ends);
  return Array.from(set);
};

const parseAngle = (source: string) => {
  const hit = source.match(/\b(45|90|180)\s*(?:deg|degree)?\b/i)?.[1];
  return hit ? Number(hit) : undefined;
};

const parseRadius = (source: string) => {
  if (/\blong radius|\blr\b/i.test(source)) return "LR";
  if (/\bshort radius|\bsr\b/i.test(source)) return "SR";
  return undefined;
};

const collectStandards = (line: z.infer<typeof parserResponseSchema>["line_items"][number]) => Array.from(new Set([
  ...line.material_grade.astm_asme_material_spec,
  ...line.standards.dimensional_standards,
  ...line.standards.material_standards,
  ...line.standards.testing_standards,
  ...line.standards.compliance_requirements
].map((value) => value.trim()).filter(Boolean)));

const summarizeDimensions = (line: z.infer<typeof parserResponseSchema>["line_items"][number]) => {
  const parts = [
    line.dimensions.nominal_size ? `NPS ${line.dimensions.nominal_size}` : null,
    line.dimensions.size_1 && line.dimensions.size_2 ? `${line.dimensions.size_1} x ${line.dimensions.size_2}` : null,
    line.dimensions.schedule ? `SCH ${line.dimensions.schedule}` : null,
    line.dimensions.od ? `OD ${line.dimensions.od}` : null,
    line.dimensions.id ? `ID ${line.dimensions.id}` : null,
    line.dimensions.wall_thickness ? `WT ${line.dimensions.wall_thickness}` : null,
    line.dimensions.length ? `L ${line.dimensions.length}` : null,
    line.dimensions.thickness ? `T ${line.dimensions.thickness}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : undefined;
};

const estimateWeight = (item: ExtractedLineItem) => {
  const linearLength = item.quantityUnit === "ft"
    ? item.quantity * 12
    : item.quantityUnit === "m"
      ? item.quantity * 39.3700787
      : undefined;

  if (item.thickness && item.width && (item.length || linearLength)) {
    const pieceCount = ["pcs", "pieces", "ea", "each", "lengths", "spools", "sets"].includes(item.quantityUnit) ? item.quantity : 1;
    return calcWeightFromGeometry(item.thickness, item.width, linearLength ?? item.length ?? 0, pieceCount);
  }

  return undefined;
};

const heuristicQuantity = (text: string) => {
  const qtyLine = text.match(/\b(?:qty|quantity|required|need)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(pieces?|pcs?|ea|each|lengths?|spools?|sets?|lots?|lbs?|kgs?|ft|feet|m|mtrs?|meters?)?\b/i);
  if (qtyLine) {
    return { quantity: Number(qtyLine[1]), quantityUnit: normalizeQuantityUnit(qtyLine[2]) };
  }
  const direct = text.match(/\b(\d+(?:\.\d+)?)\s*(pieces?|pcs?|ea|each|lengths?|spools?|sets?|lots?|lbs?|kgs?|ft|feet|m|mtrs?|meters?)\b/i);
  if (direct) {
    return { quantity: Number(direct[1]), quantityUnit: normalizeQuantityUnit(direct[2]) };
  }
  return null;
};

const parseHeuristicLine = (block: string): ExtractedLineItem => {
  const finish = block.match(finishPattern)?.[1]?.toUpperCase();
  const dims = block.match(dimsPattern);
  const dims2 = block.match(twoDimsPattern);
  const heuristicQty = heuristicQuantity(block);

  const thickness = dims?.[1]
    ? parseGaugeOrThickness(dims[1]) ?? parseMeasurementInches(dims[1])
    : dims2?.[1]
      ? parseGaugeOrThickness(dims2[1]) ?? parseMeasurementInches(dims2[1])
      : undefined;
  const width = dims?.[2]
    ? parseMeasurementInches(dims[2])
    : dims2?.[2]
      ? parseMeasurementInches(dims2[2])
      : undefined;
  const length = dims?.[3]
    ? parseMeasurementInches(dims[3])
    : block.match(/\b(\d+(?:\.\d+)?)\s*(mm|cm|m|in|")\s*long\b/i)
      ? parseMeasurementInches(`${RegExp.$1} ${RegExp.$2}`)
      : undefined;

  const item: ExtractedLineItem = {
    category: detectCategory(block),
    grade: normalizeGrade([], block),
    finish,
    schedule: parseSchedule(undefined, block),
    pressureClass: parsePressureClass(undefined, undefined, block),
    nominalSize: parseNominalSize(block.match(/\b(?:nps|dn)?\s*(\d+(?:\.\d+)?\s*(?:"|in|inch|mm)?)\b/i)?.[1]),
    thickness: Number.isFinite(thickness) ? thickness : undefined,
    width: Number.isFinite(width) ? width : undefined,
    length: Number.isFinite(length) ? length : undefined,
    od: block.match(/\bod\s*[:=]?\s*([\d./]+\s*(?:mm|cm|m|in|"))/i) ? parseMeasurementInches(RegExp.$1) : undefined,
    id: block.match(/\bid\s*[:=]?\s*([\d./]+\s*(?:mm|cm|m|in|"))/i) ? parseMeasurementInches(RegExp.$1) : undefined,
    wall: block.match(/\b(?:wall|wt)\s*[:=]?\s*([\d./]+\s*(?:mm|cm|m|in|"))/i) ? parseMeasurementInches(RegExp.$1) : undefined,
    endType: /\b(bw|butt weld)\b/i.test(block) ? "BW" : /\b(sw|socket weld)\b/i.test(block) ? "SW" : /\b(npt|thread|thd)\b/i.test(block) ? "THD" : undefined,
    face: /\brtj\b/i.test(block) ? "RTJ" : /\brf\b/i.test(block) ? "RF" : undefined,
    standards: Array.from(new Set((block.match(/\b(?:ASTM|ASME|API|MSS|ISO|DIN|EN)\s*[A-Z0-9.-]+\b/gi) ?? []).map((value) => value.toUpperCase()))),
    dimensionSummary: undefined,
    notes: undefined,
    quantity: heuristicQty?.quantity ?? 1,
    quantityUnit: heuristicQty?.quantityUnit ?? "pcs",
    rawSpec: block,
    sourceText: block,
    confidence: heuristicQty ? 0.55 : 0.4
  };

  item.dimensionSummary = summarizeDimensions({
    line_id: "",
    product_family: item.category.toLowerCase(),
    product_type: item.category,
    description_normalized: block,
    quantity: item.quantity,
    quantity_uom: item.quantityUnit,
    material_grade: {
      base_material: null,
      grade: item.grade,
      alloy: null,
      astm_asme_material_spec: item.standards ?? [],
      nace: null,
      liner_or_trim_material: null
    },
    dimensions: {
      nominal_size: item.nominalSize ? `${item.nominalSize} in` : null,
      size_1: null,
      size_2: null,
      od: item.od ? `${item.od} in` : null,
      id: item.id ? `${item.id} in` : null,
      wall_thickness: item.wall ? `${item.wall} in` : null,
      schedule: item.schedule ?? null,
      length: item.length ? `${item.length} in` : null,
      thickness: item.thickness ? `${item.thickness} in` : null
    },
    pressure_temperature_rating: {
      pressure_class: item.pressureClass ?? null,
      pressure_rating: null,
      temperature_rating: null
    },
    end_connections: item.endType ? [item.endType] : [],
    manufacturing_details: {
      seamless_or_welded: null,
      fabrication: null,
      ends: null,
      bore: null,
      operator: null
    },
    standards: {
      dimensional_standards: [],
      material_standards: item.standards ?? [],
      testing_standards: [],
      compliance_requirements: []
    },
    commercial_notes: [],
    source_text: block,
    parsing_notes: [],
    confidence: item.confidence ?? 0.4
  });
  item.estimatedWeightLb = estimateWeight(item);
  return item;
};

const inferBlocks = (text: string) => {
  const lines = cleanInput(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const isBoundary = /^\d+[).]|^-|^item\b|^line\b/i.test(line);
    const isProducty = /(pipe|tube|tubing|valve|flange|elbow|tee|reducer|cap|coupling|union|nipple|olet|gasket|strainer|class|sch|qty|astm|asme|api|\d+\s*(?:in|inch|mm|ft|m|nb))/i.test(line);
    if (isBoundary && current.length) {
      blocks.push(current.join(" "));
      current = [];
    }
    if (isProducty || current.length) current.push(line);
  }

  if (current.length) blocks.push(current.join(" "));
  return blocks.length ? blocks : [cleanInput(text)];
};

const heuristicParse = (text: string) => inferBlocks(text)
  .filter((block) => /(pipe|tube|tubing|valve|flange|elbow|tee|reducer|cap|coupling|union|nipple|olet|gasket|strainer|sch|class|qty)/i.test(block))
  .map((block) => parseHeuristicLine(block));

const mapLineItem = (line: z.infer<typeof parserResponseSchema>["line_items"][number]): ExtractedLineItem => {
  const source = line.source_text || line.description_normalized || line.product_type || line.product_family || "";
  const quantityFallback = heuristicQuantity(source);
  const quantity = line.quantity ?? quantityFallback?.quantity ?? 1;
  const quantityUnit = normalizeQuantityUnit(line.quantity_uom ?? quantityFallback?.quantityUnit);
  const notes = [
    ...line.commercial_notes,
    ...line.parsing_notes,
    line.material_grade.nace ? `NACE ${line.material_grade.nace}` : null,
    line.material_grade.liner_or_trim_material ? `Trim/liner ${line.material_grade.liner_or_trim_material}` : null,
    line.manufacturing_details.fabrication,
    line.manufacturing_details.seamless_or_welded,
    line.manufacturing_details.bore,
    line.manufacturing_details.operator
  ].filter(Boolean).join(" | ");

  const item: ExtractedLineItem = {
    category: normalizeFamily(line.product_family, line.product_type, source),
    productFamily: line.product_family ?? undefined,
    productType: line.product_type ?? undefined,
    grade: normalizeGrade([
      line.material_grade.grade,
      line.material_grade.alloy,
      line.material_grade.base_material
    ], source),
    nominalSize: parseNominalSize(line.dimensions.nominal_size ?? line.dimensions.size_1),
    schedule: parseSchedule(line.dimensions.schedule, source),
    pressureClass: parsePressureClass(
      line.pressure_temperature_rating.pressure_class,
      line.pressure_temperature_rating.pressure_rating,
      source
    ),
    endType: parseEndConnections(line)[0],
    endTypeSecondary: parseEndConnections(line)[1],
    face: /\brtj\b/i.test(source) ? "RTJ" : /\brf\b/i.test(source) ? "RF" : /\bff\b/i.test(source) ? "FF" : undefined,
    standards: collectStandards(line),
    dimensionSummary: summarizeDimensions(line),
    thickness: parseGaugeOrThickness(line.dimensions.thickness ?? "") ?? parseMeasurementInches(line.dimensions.thickness ?? ""),
    width: parseMeasurementInches(line.dimensions.size_1 ?? ""),
    length: parseMeasurementInches(line.dimensions.length ?? ""),
    od: parseMeasurementInches(line.dimensions.od ?? ""),
    id: parseMeasurementInches(line.dimensions.id ?? ""),
    wall: parseMeasurementInches(line.dimensions.wall_thickness ?? ""),
    angle: parseAngle(source),
    radius: parseRadius(source),
    notes: notes || undefined,
    quantity: Math.max(1, Number(quantity || 1)),
    quantityUnit,
    rawSpec: source,
    sourceText: source,
    confidence: Math.max(0, Math.min(1, Number(line.confidence || 0)))
  };

  if (!item.width && line.dimensions.size_2) {
    item.width = parseMeasurementInches(line.dimensions.size_2);
  }

  if (!item.dimensionSummary) {
    item.dimensionSummary = [line.dimensions.size_1, line.dimensions.size_2].filter(Boolean).join(" x ") || undefined;
  }

  item.estimatedWeightLb = estimateWeight(item);
  return item;
};

const llmParse = async (text: string, provider?: LlmProvider) => {
  const llm = createLlmClient(provider);
  if (!llm) return null;

  const cleanedForModel = stripEmailNoise(text) || cleanInput(text);
  const response = await llm.client.chat.completions.create({
    model: llm.model,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: exactPrompt },
      { role: "user", content: `Parse the following RFQ text:\n\n${cleanedForModel}` }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return null;

  const parsedJson = JSON.parse(content);
  const parsed = parserResponseSchema.safeParse(parsedJson);
  if (!parsed.success) return null;

  const items = parsed.data.line_items
    .filter((line) => line.source_text || line.description_normalized || line.product_type || line.product_family)
    .map(mapLineItem)
    .filter((item) => item.category && item.rawSpec);

  return items.length ? items : null;
};

export const parseRFQ = async (text: string, provider?: LlmProvider): Promise<ExtractedLineItem[]> => {
  const cleaned = cleanInput(text);

  if (createLlmClient(provider)) {
    try {
      const items = await llmParse(cleaned, provider);
      if (items?.length) return items;
    } catch {
      // Fall back to heuristic parsing.
    }
  }

  const heuristic = heuristicParse(cleaned);
  return heuristic.length ? heuristic : [parseHeuristicLine(cleaned)];
};
