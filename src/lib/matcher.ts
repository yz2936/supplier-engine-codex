import { ExtractedLineItem, InventoryItem, MatchResult } from "@/lib/types";
import { dualCertifiedMatch, overlapScore } from "@/lib/utils";

const dimScore = (requested?: number, candidate?: number, tolerance = 0.02) => {
  if (!requested || !candidate) return 0.4;
  const delta = Math.abs(requested - candidate);
  return delta <= tolerance ? 1 : Math.max(0, 1 - delta / (requested || 1));
};

const scoreItem = (req: ExtractedLineItem, inv: InventoryItem) => {
  let score = 0;
  if (req.category.toLowerCase() === inv.category.toLowerCase()) score += 2;
  if (dualCertifiedMatch(req.grade, inv.grade)) score += 2;
  if (req.finish && req.finish.toLowerCase() === inv.finish.toLowerCase()) score += 1;
  score += dimScore(req.thickness, inv.thickness, 0.01);
  score += dimScore(req.width, inv.width, 0.5);
  score += dimScore(req.length, inv.length, 0.5);
  score += overlapScore(req.rawSpec, `${inv.sku} ${inv.category} ${inv.grade} ${inv.finish} ${inv.schedule ?? ""} ${inv.specText ?? ""}`) * 2;
  return score;
};

export const findBestMatches = (items: ExtractedLineItem[], inventory: InventoryItem[]): MatchResult[] => {
  return items.map((requested) => {
    const scored = inventory
      .map((inv) => ({ item: inv, score: scoreItem(requested, inv) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const alternatives = scored.slice(1, 4).map((s) => s.item);

    if (!best || best.score < 2.5) {
      return { requested, stockStatus: "red", score: best?.score ?? 0, alternatives, inventoryItem: undefined };
    }

    const qtyNeeded = requested.quantityUnit === "lbs"
      ? requested.quantity
      : requested.estimatedWeightLb ?? requested.quantity;

    const onHand = best.item.qtyOnHand;
    const stockStatus = onHand >= qtyNeeded ? "green" : onHand > 0 ? "yellow" : "red";

    return { requested, inventoryItem: best.item, score: best.score, stockStatus, alternatives };
  });
};
