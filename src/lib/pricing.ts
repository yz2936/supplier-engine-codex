import { MatchResult, QuoteLine, Surcharge } from "@/lib/types";
import { clamp, monthYear } from "@/lib/utils";

const gradeSurcharge = (grade: string, surcharges: Surcharge[]) => {
  const key = monthYear();
  return surcharges.find((s) => s.grade.toUpperCase() === grade.toUpperCase() && s.monthYear === key)?.valuePerLb ?? 0;
};

export const buildQuoteLines = (
  matches: MatchResult[],
  surcharges: Surcharge[],
  marginPercent: number
): QuoteLine[] => {
  const marginMultiplier = 1 + clamp(marginPercent, 0, 80) / 100;

  return matches.map((m) => {
    const inv = m.inventoryItem;
    const qty = m.requested.quantity;
    const surcharge = gradeSurcharge(m.requested.grade, surcharges);
    const basePrice = inv?.basePrice ?? 0;

    const estimated = m.requested.estimatedWeightLb;
    const byUnitWeight = (inv?.weightPerUnit ?? 1) * qty;
    const weight = m.requested.quantityUnit === "lbs"
      ? qty
      : estimated ?? byUnitWeight;

    const unitPrice = weight > 0 ? ((basePrice + surcharge) * weight * marginMultiplier) / qty : 0;
    const extendedPrice = unitPrice * qty;

    const description = inv
      ? `${inv.sku} | ${inv.grade} ${inv.category} ${inv.thickness} x ${inv.width} x ${inv.length} ${inv.finish}${inv.schedule ? ` SCH ${inv.schedule}` : ""}`
      : `${m.requested.category} ${m.requested.grade} ${m.requested.dimensionSummary || m.requested.rawSpec}`.trim();

    return {
      requested: m.requested,
      sku: inv?.sku,
      description,
      quantity: qty,
      unit: m.requested.quantityUnit,
      unitPrice,
      extendedPrice,
      stockStatus: m.stockStatus
    };
  });
};

export const quoteTotal = (lines: QuoteLine[]) => lines.reduce((sum, l) => sum + l.extendedPrice, 0);
