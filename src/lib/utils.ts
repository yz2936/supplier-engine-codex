import { CATEGORY_KEYWORDS, GAUGE_TO_DECIMAL, STEEL_DENSITY } from "@/lib/constants";

export const monthYear = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const normalizeGrade = (grade: string) => grade.toUpperCase().replace(/\s+/g, "");

export const dualCertifiedMatch = (requested: string, inventory: string) => {
  const r = normalizeGrade(requested);
  const i = normalizeGrade(inventory);
  const dualSet = new Set(["304", "304L"]);
  if (dualSet.has(r) && dualSet.has(i)) return true;
  return r === i;
};

export const parseFractionOrDecimal = (value: string) => {
  const v = value.trim().replace(/"/g, "");
  if (/^\d+\/\d+$/.test(v)) {
    const [a, b] = v.split("/").map(Number);
    return a / b;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const mmToInches = (mm: number) => mm / 25.4;
export const metersToInches = (m: number) => m * 39.3700787;

export const parseGaugeOrThickness = (input?: string) => {
  if (!input) return undefined;
  const raw = input.toLowerCase().replace(/\s+/g, "");
  if (GAUGE_TO_DECIMAL[raw]) return GAUGE_TO_DECIMAL[raw];
  return parseFractionOrDecimal(raw);
};

export const parseMeasurementInches = (input?: string) => {
  if (!input) return undefined;
  const raw = input.trim().toLowerCase();
  const num = Number(raw.replace(/[^0-9./-]/g, ""));
  const parsed = parseFractionOrDecimal(raw.replace(/[^0-9./]/g, ""));
  const value = Number.isFinite(num) && raw.match(/^\d+(\.\d+)?$/) ? num : parsed;
  if (value === undefined) return undefined;
  if (/mm/.test(raw)) return mmToInches(value);
  if (/cm/.test(raw)) return mmToInches(value * 10);
  if (/\bmtrs?\b|\bmeters?\b|\bm\b/.test(raw) && !/(mm|cm)/.test(raw)) return metersToInches(value);
  return value;
};

export const detectCategory = (line: string) => {
  const lower = line.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return "Unknown";
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const calcWeightFromGeometry = (thickness: number, width: number, length: number, quantity: number) =>
  thickness * width * length * STEEL_DENSITY * quantity;

export const parseCSV = (text: string) => {
  const rows = text
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => r.split(",").map((c) => c.trim()));
  if (!rows.length) return { headers: [], rows: [] as string[][] };
  const [headers, ...dataRows] = rows;
  return { headers, rows: dataRows };
};

export const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export const textTokens = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

export const overlapScore = (a: string, b: string) => {
  const at = new Set(textTokens(a));
  const bt = new Set(textTokens(b));
  if (!at.size || !bt.size) return 0;
  let common = 0;
  for (const t of at) if (bt.has(t)) common += 1;
  return common / Math.max(at.size, bt.size);
};
