import * as XLSX from "xlsx";
import { InventoryItem } from "@/lib/types";
import { calcWeightFromGeometry, detectCategory, normalizeHeader, parseGaugeOrThickness, parseMeasurementInches } from "@/lib/utils";

const headerAliases: Record<string, string[]> = {
  sku: ["sku", "item", "itemcode", "itemnumber", "partnumber", "materialcode", "stockcode", "productcode"],
  category: ["category", "producttype", "type", "shape", "form"],
  grade: ["grade", "alloy", "material", "stainlessgrade", "specgrade"],
  thickness: ["thickness", "gauge", "wall", "wallthickness", "thk"],
  width: ["width", "od", "diameter", "dia", "size", "nominalsize", "nps", "nb"],
  length: ["length", "len", "cutlength"],
  dimensions: ["dimensions", "dimension", "size", "specsize", "dim"],
  finish: ["finish", "surface", "polish"],
  weightPerUnit: ["weightperunit", "unitweight", "wtperpc", "weight", "lbsperunit"],
  basePrice: ["baseprice", "price", "unitprice", "priceperlb", "cost", "sellprice"],
  qtyOnHand: ["qtyonhand", "qty", "quantity", "stock", "available", "onhand", "inventoryqty"],
  schedule: ["schedule", "sch"],
  specText: ["description", "productdescription", "spec", "specification", "itemdescription", "desc"]
};

const findColumnIndex = (headers: string[], aliases: string[]) => {
  for (const alias of aliases) {
    const exact = headers.findIndex((h) => typeof h === "string" && h === alias);
    if (exact >= 0) return exact;
  }
  for (const alias of aliases) {
    const partial = headers.findIndex((h) => typeof h === "string" && h.includes(alias));
    if (partial >= 0) return partial;
  }
  return -1;
};

const scoreHeaderRow = (cells: string[]) => {
  const headers = cells.map((v) => normalizeHeader(String(v ?? "")));
  let score = 0;
  for (const aliases of Object.values(headerAliases)) {
    if (findColumnIndex(headers, aliases) >= 0) score += 1;
  }
  return score;
};

const detectHeaderRow = (rows: string[][]) => {
  const candidates = rows.slice(0, 15);
  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < candidates.length; i += 1) {
    const score = scoreHeaderRow(candidates[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx < 0 || bestScore < 2) {
    throw new Error("Could not identify header row. Please include column headers.");
  }

  return bestIdx;
};

const parseGrade = (text: string) => text.match(/\b(304L?|316L?|430|410|2205|253MA|309S?|310S?)\b/i)?.[1]?.toUpperCase() ?? "UNKNOWN";
const parseFinish = (text: string) => text.match(/\b(2B|#4|BA|HRAP)\b/i)?.[1]?.toUpperCase() ?? "";
const parseSchedule = (text: string) => text.match(/\b(?:schedule|sch)\s*([a-z0-9]+)/i)?.[1]?.toUpperCase() ?? undefined;
const parseNominalSize = (text: string) => {
  const nb = text.match(/\b(\d{2,3})\s*nb\b/i)?.[1];
  if (nb) {
    const map: Record<string, number> = {
      "8": 0.25, "10": 0.375, "15": 0.5, "20": 0.75, "25": 1, "32": 1.25, "40": 1.5, "50": 2, "65": 2.5,
      "80": 3, "100": 4, "125": 5, "150": 6, "200": 8, "250": 10, "300": 12
    };
    return map[nb] ?? Number(nb);
  }
  const nps = text.match(/\b(?:nps|dn)\s*(\d+(?:\.\d+)?)\b/i)?.[1];
  return nps ? Number(nps) : undefined;
};

const parseDimsFromSpec = (text: string) => {
  const dims3 = text.match(/(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:ga|mm|cm|m|in|"))?)\s*[x×]\s*(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:mm|cm|m|in|"))?)\s*[x×]\s*(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:mm|cm|m|in|"))?)/i);
  if (dims3) {
    return {
      thickness: parseGaugeOrThickness(dims3[1]) ?? parseMeasurementInches(dims3[1]),
      width: parseMeasurementInches(dims3[2]),
      length: parseMeasurementInches(dims3[3])
    };
  }

  const dims2 = text.match(/(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:ga|mm|cm|m|in|"))?)\s*[x×]\s*(\d+(?:\.\d+)?(?:\/\d+)?(?:\s?(?:mm|cm|m|in|"))?)/i);
  if (dims2) {
    return {
      thickness: parseGaugeOrThickness(dims2[1]) ?? parseMeasurementInches(dims2[1]),
      width: parseMeasurementInches(dims2[2]),
      length: undefined
    };
  }

  return { thickness: undefined, width: undefined, length: undefined };
};

const parseNum = (v: string) => {
  const cleaned = v.replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

const parseDelimitedFallback = (text: string): string[][] => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const candidates = [",", ";", "\t", "|"];
  const scored = candidates.map((d) => ({
    d,
    score: lines.slice(0, 20).reduce((sum, line) => sum + (line.split(d).length - 1), 0)
  })).sort((a, b) => b.score - a.score);
  const delim = scored[0]?.score ? scored[0].d : ",";
  return lines.map((line) => line.split(delim).map((c) => c.replace(/^"|"$/g, "").trim()));
};

const toDenseRow = (row: (string | number | undefined)[]) => {
  const dense: string[] = [];
  for (let i = 0; i < row.length; i += 1) {
    dense.push(String(row[i] ?? ""));
  }
  return dense;
};

const cleanMatrix = (matrix: string[][]) =>
  matrix
    .map((row) => toDenseRow(row).map((v) => String(v ?? "").replace(/\u00a0/g, " ").trim()))
    .filter((row) => row.some((c) => c.length > 0));

const parseRowsToInventory = (matrix: string[][]): InventoryItem[] => {
  const normalizedMatrix = cleanMatrix(matrix);
  const headerRowIndex = detectHeaderRow(normalizedMatrix);
  const headerCells = (normalizedMatrix[headerRowIndex] ?? []).map((v) => normalizeHeader(String(v ?? "")));
  const dataRows = normalizedMatrix.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim().length));

  const idx: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(headerAliases)) {
    idx[key] = findColumnIndex(headerCells, aliases);
  }

  const items = dataRows.map((row, i) => {
    const read = (key: string) => {
      const col = idx[key];
      if (col < 0) return "";
      return String(row[col] ?? "").trim();
    };

    const specText = read("specText")
      || read("dimensions")
      || [read("category"), read("grade"), read("thickness"), read("width"), read("length"), read("finish")].filter(Boolean).join(" ");
    const parsedDims = parseDimsFromSpec(specText);

    const thicknessRaw = read("thickness") || read("dimensions");
    const widthRaw = read("width") || read("dimensions");
    const lengthRaw = read("length");
    const thickness = parseGaugeOrThickness(thicknessRaw) ?? parseMeasurementInches(thicknessRaw) ?? parsedDims.thickness ?? 0;
    const width = parseMeasurementInches(widthRaw) ?? parseNominalSize(widthRaw) ?? parsedDims.width ?? 0;
    const length = parseMeasurementInches(lengthRaw) ?? parsedDims.length ?? parseMeasurementInches(specText.match(/\blength\s*[:=]?\s*([\d./]+\s*(?:mm|cm|m|in|"))/i)?.[1] ?? "") ?? 0;

    const sku = read("sku") || `ROW-${i + 1}`;
    const category = read("category") || detectCategory(specText) || "Unknown";
    const grade = (read("grade") || parseGrade(specText)).toUpperCase();
    const finish = (read("finish") || parseFinish(specText) || "STD").toUpperCase();

    const derivedWeight = thickness && width && length ? calcWeightFromGeometry(thickness, width, length, 1) : 0;
    const weightPerUnit = parseNum(read("weightPerUnit")) ?? derivedWeight;
    const basePrice = parseNum(read("basePrice")) ?? 0;
    const qtyOnHand = parseNum(read("qtyOnHand")) ?? 0;

    const schedule = read("schedule") || parseSchedule(specText);

    return {
      sku,
      category,
      grade,
      thickness,
      width,
      length,
      finish,
      weightPerUnit,
      basePrice,
      qtyOnHand,
      schedule,
      nominalSize: parseNominalSize(`${read("width")} ${specText}`),
      specText
    } satisfies InventoryItem;
  }).filter((item) => item.sku && item.category && item.grade);

  if (!items.length) {
    throw new Error("No valid inventory rows found.");
  }

  return items;
};

const parseExcel = async (file: File): Promise<InventoryItem[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  if (!workbook.SheetNames.length) throw new Error("Excel file has no sheets");

  const errors: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const matrix = XLSX.utils
      .sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false })
      .map((r) => r.map((v) => String(v ?? "").trim()));
    if (!matrix.length) continue;
    try {
      const parsed = parseRowsToInventory(matrix);
      if (parsed.length) return parsed;
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : "parse error"}`);
    }
  }
  throw new Error(`Could not parse workbook sheets. ${errors.join(" | ")}`);
};

const parseCsvFile = async (file: File): Promise<InventoryItem[]> => {
  const text = await file.text();
  try {
    const workbook = XLSX.read(text, { type: "string", raw: false });
    const firstSheetName = workbook.SheetNames[0];
    if (firstSheetName) {
      const sheet = workbook.Sheets[firstSheetName];
      const matrix = XLSX.utils
        .sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false })
        .map((r) => r.map((v) => String(v ?? "").trim()));
      if (matrix.length) return parseRowsToInventory(matrix);
    }
  } catch {
    // Fallback parser below.
  }

  const fallback = parseDelimitedFallback(text);
  if (!fallback.length) throw new Error("CSV file is empty");
  return parseRowsToInventory(fallback);
};

export const parseInventoryFile = async (file: File): Promise<InventoryItem[]> => {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsvFile(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseExcel(file);
  throw new Error("Unsupported file type. Please upload CSV, XLSX, or XLS.");
};
