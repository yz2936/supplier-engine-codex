import { Surcharge } from "@/lib/types";
import { monthYear } from "@/lib/utils";

const gradeAlias = (grade: string) => grade.toUpperCase().replace(/\s+/g, "");

const pickNumber = (input: unknown): number | null => {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const n = Number(input.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of ["surchargePerLb", "valuePerLb", "pricePerLb", "price", "value"]) {
      const val = pickNumber(obj[key]);
      if (val !== null) return val;
    }
  }
  return null;
};

export const recommendSurchargeForGrade = async (
  grade: string,
  existing: Surcharge[]
): Promise<{ valuePerLb: number; source: "api" | "fallback_existing" | "fallback_default" }> => {
  const normalized = gradeAlias(grade);
  const month = monthYear();
  const existingMatch = existing.find((s) => gradeAlias(s.grade) === normalized && s.monthYear === month);
  const defaultByGrade: Record<string, number> = {
    "304": 0.18,
    "304L": 0.18,
    "316": 0.31,
    "316L": 0.31,
    "430": 0.14,
    "410": 0.16,
    "2205": 0.35,
    "253MA": 0.42
  };

  const template = process.env.RAW_MATERIAL_API_URL_TEMPLATE?.trim();
  const apiKey = process.env.RAW_MATERIAL_API_KEY?.trim();
  const apiKeyHeader = process.env.RAW_MATERIAL_API_KEY_HEADER?.trim() || "x-api-key";

  if (template) {
    try {
      const url = template.includes("{grade}") ? template.replaceAll("{grade}", encodeURIComponent(normalized)) : `${template}${template.includes("?") ? "&" : "?"}grade=${encodeURIComponent(normalized)}`;
      const headers: HeadersInit = {};
      if (apiKey) headers[apiKeyHeader] = apiKey;
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const picked = pickNumber(json);
        if (picked !== null) {
          return { valuePerLb: Math.max(0, picked), source: "api" };
        }
      }
    } catch {
      // fall through to fallback logic
    }
  }

  if (existingMatch) return { valuePerLb: existingMatch.valuePerLb, source: "fallback_existing" };
  return { valuePerLb: defaultByGrade[normalized] ?? 0.2, source: "fallback_default" };
};
