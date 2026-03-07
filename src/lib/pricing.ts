import { MatchResult, QuoteLine, Surcharge } from "@/lib/types";
import { clamp, monthYear } from "@/lib/utils";
import { describeRequestedItem, formatInches } from "@/lib/format";

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
  const unitLengthInches = (unit: string) => {
    if (unit === "ft") return 12;
    if (unit === "m") return 39.3700787;
    return null;
  };

  const requestedWeightLb = (m: MatchResult) => {
    const req = m.requested;
    const inv = m.inventoryItem;
    if (req.quantityUnit === "lbs") return req.quantity;
    if (req.quantityUnit === "kg") return req.quantity * 2.20462;

    const linearInches = unitLengthInches(req.quantityUnit);
    if (linearInches && inv?.weightPerUnit && inv.length > 0) {
      const weightPerRequestedUnit = inv.weightPerUnit / (inv.length / linearInches);
      return req.quantity * weightPerRequestedUnit;
    }

    if (["pcs", "pieces", "ea", "each", "lengths"].includes(req.quantityUnit)) {
      return req.estimatedWeightLb ?? (inv?.weightPerUnit ?? 1) * req.quantity;
    }

    return req.estimatedWeightLb ?? (inv?.weightPerUnit ?? 1) * req.quantity;
  };

  return matches.map((m) => {
    const inv = m.inventoryItem;
    const qty = m.requested.quantity;
    const surcharge = gradeSurcharge(m.requested.grade, surcharges);
    const basePrice = inv?.basePrice ?? 0;
    const weight = requestedWeightLb(m);

    const unitPrice = weight > 0 ? ((basePrice + surcharge) * weight * marginMultiplier) / qty : 0;
    const extendedPrice = unitPrice * qty;

    const description = inv
      ? [
        inv.sku,
        `${inv.grade} ${inv.category}`.trim(),
        [formatInches(inv.thickness), formatInches(inv.width), formatInches(inv.length)].filter(Boolean).join(" x "),
        inv.finish,
        inv.schedule ? `SCH ${inv.schedule}` : undefined,
        inv.specText
      ].filter(Boolean).join(" | ")
      : describeRequestedItem(m.requested) || m.requested.rawSpec;

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
