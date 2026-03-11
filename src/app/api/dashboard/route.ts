import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { requireUser } from "@/lib/server-auth";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_COUNT = 6;

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

type SupplierInsight = {
  id: string;
  area: "inventory" | "operations" | "sales";
  tone: "neutral" | "warn" | "good";
  title: string;
  detail: string;
};

const buildMonthWindow = () => {
  const now = new Date();
  const months: Array<{ key: string; label: string }> = [];
  for (let i = MONTH_COUNT - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({
      key: monthKey(d),
      label: d.toLocaleString("en-US", { month: "short" })
    });
  }
  return months;
};

const topEntries = (counts: Map<string, number>, limit = 2) =>
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const data = await readData();
  const now = Date.now();
  const last7 = now - 7 * DAY_MS;

  const inboundMessages = data.buyerMessages
    .filter((m) => m.direction === "inbound")
    .filter((m) => auth.user.role !== "sales_manager" || m.managerUserId === auth.user.id);

  const inboundLast7d = inboundMessages.filter((m) => new Date(m.receivedAt).getTime() >= last7);
  const recentInbound = inboundMessages
    .slice()
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, 8)
    .map((m) => {
      const buyer = data.buyers.find((b) => b.id === m.buyerId);
      return {
        id: m.id,
        buyerName: buyer?.companyName || m.fromEmail,
        fromEmail: m.fromEmail,
        subject: m.subject,
        receivedAt: m.receivedAt
      };
    });

  const inventory = data.inventory;
  const lowStock = inventory.filter((i) => i.qtyOnHand > 0 && i.qtyOnHand < 1000).length;
  const outOfStock = inventory.filter((i) => i.qtyOnHand <= 0).length;

  const sourcing = data.sourcingRequests
    .filter((r) => auth.user.role === "sales_manager" || r.createdByUserId === auth.user.id);
  const openSourcing = sourcing.filter((r) => r.status === "Open").length;
  const emailedSourcing = sourcing.filter((r) => Boolean(r.lastEmailedAt)).length;

  const manufacturers = data.manufacturers;
  const avgLeadTime = manufacturers.length
    ? manufacturers.reduce((sum, m) => sum + (m.leadTimeDays ?? 0), 0) / manufacturers.length
    : 0;
  const preferredCount = manufacturers.filter((m) => m.preferred).length;
  const manufacturersAtRisk = manufacturers.filter((m) => (m.leadTimeDays ?? 0) > 21).length;

  const months = buildMonthWindow();
  const monthSet = new Set(months.map((m) => m.key));
  const rfqMap = new Map(months.map((m) => [m.key, 0]));
  const quoteMap = new Map(months.map((m) => [m.key, 0]));
  const demandMap = new Map(months.map((m) => [m.key, 0]));
  const restockMap = new Map(months.map((m) => [m.key, 0]));

  for (const m of inboundMessages) {
    const key = monthKey(new Date(m.receivedAt));
    if (monthSet.has(key)) rfqMap.set(key, (rfqMap.get(key) || 0) + 1);
  }

  const scopedQuotes = auth.user.role === "sales_manager"
    ? data.quotes
    : data.quotes.filter((q) => q.createdByUserId === auth.user.id);
  for (const q of scopedQuotes) {
    const key = monthKey(new Date(q.createdAt));
    if (!monthSet.has(key)) continue;
    quoteMap.set(key, (quoteMap.get(key) || 0) + 1);
    const qtyDemand = (q.itemsQuoted || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    demandMap.set(key, (demandMap.get(key) || 0) + qtyDemand);
  }

  for (const s of sourcing) {
    if (s.sourceContext !== "inventory_restock") continue;
    const key = monthKey(new Date(s.createdAt));
    if (!monthSet.has(key)) continue;
    const qtyRestock = (s.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    restockMap.set(key, (restockMap.get(key) || 0) + qtyRestock);
  }

  let cumulativeDelta = 0;
  const rfqQuoteTrend = months.map((m) => ({
    month: m.label,
    rfqs: rfqMap.get(m.key) || 0,
    quotes: quoteMap.get(m.key) || 0
  }));
  const inventoryTrend = months.map((m) => {
    const demand = demandMap.get(m.key) || 0;
    const restock = restockMap.get(m.key) || 0;
    const netDelta = restock - demand;
    cumulativeDelta += netDelta;
    return {
      month: m.label,
      demandQty: Number(demand.toFixed(0)),
      restockQty: Number(restock.toFixed(0)),
      netDelta: Number(netDelta.toFixed(0)),
      cumulativeDelta: Number(cumulativeDelta.toFixed(0))
    };
  });

  const scopedInboundMessages = inboundMessages.slice();
  const topDemandCounts = new Map<string, number>();
  for (const quote of scopedQuotes) {
    for (const item of quote.itemsQuoted || []) {
      const raw = item.requested?.category || item.requested?.productType || item.description || "Unclassified";
      const key = String(raw).trim();
      if (!key) continue;
      topDemandCounts.set(key, (topDemandCounts.get(key) || 0) + Number(item.quantity || 0));
    }
  }

  const complaintSignals = {
    delivery: 0,
    quality: 0,
    pricing: 0
  };
  for (const message of scopedInboundMessages) {
    const text = `${message.subject} ${message.bodyText}`.toLowerCase();
    if (/\b(late|delay|lead time|eta|expedite|urgent|asap|delivery)\b/.test(text)) complaintSignals.delivery += 1;
    if (/\b(damaged|damage|wrong|incorrect|packing|quality|defect|issue)\b/.test(text)) complaintSignals.quality += 1;
    if (/\b(price|pricing|cost|quote revision|revise)\b/.test(text)) complaintSignals.pricing += 1;
  }

  const openSourcingItems = sourcing.filter((r) => r.status === "Open").flatMap((r) => r.items || []);
  const sourcingPressureCounts = new Map<string, number>();
  for (const item of openSourcingItems) {
    const key = String(item.productType || item.grade || "Unclassified").trim();
    sourcingPressureCounts.set(key, (sourcingPressureCounts.get(key) || 0) + Number(item.quantity || 0));
  }

  const supplierInsights: SupplierInsight[] = [];
  const topDemand = topEntries(topDemandCounts);
  if (topDemand.length) {
    supplierInsights.push({
      id: "demand-mix",
      area: "sales",
      tone: "good",
      title: "Demand is concentrating in a few product families",
      detail: `${topDemand.map(([name, qty]) => `${name} (${qty})`).join(", ")} are driving the most quoted volume. Prioritize quote speed and availability on these lines.`
    });
  }

  const strongestComplaint = Object.entries(complaintSignals).sort((a, b) => b[1] - a[1])[0];
  if (strongestComplaint && strongestComplaint[1] > 0) {
    const label = strongestComplaint[0] === "delivery"
      ? "delivery timing"
      : strongestComplaint[0] === "quality"
        ? "packing or quality"
        : "pricing revisions";
    supplierInsights.push({
      id: "buyer-friction",
      area: "operations",
      tone: "warn",
      title: "Recent buyer friction is clustering around service follow-up",
      detail: `${strongestComplaint[1]} recent buyer messages referenced ${label}. Tighten response quality, lead-time accuracy, and pre-send checks to reduce repeat back-and-forth.`
    });
  }

  if (outOfStock > 0 || lowStock > 0) {
    supplierInsights.push({
      id: "inventory-risk",
      area: "inventory",
      tone: outOfStock > 0 ? "warn" : "neutral",
      title: "Inventory risk can block conversion if demand keeps rising",
      detail: `${outOfStock} SKUs are out of stock and ${lowStock} are low stock. Buyers are more likely to feel friction on availability unless at-risk items are replenished before the next quote wave.`
    });
  }

  const topSourcingPressure = topEntries(sourcingPressureCounts, 1)[0];
  if (topSourcingPressure) {
    supplierInsights.push({
      id: "sourcing-pressure",
      area: "inventory",
      tone: "warn",
      title: "Open sourcing requests show where supplier coverage is thin",
      detail: `${topSourcingPressure[0]} is generating the most open sourcing demand right now. Add capacity, stock, or backup supplier coverage here first.`
    });
  }

  if (manufacturersAtRisk > 0 || avgLeadTime > 21) {
    supplierInsights.push({
      id: "supplier-network",
      area: "operations",
      tone: "warn",
      title: "Supplier lead times need attention",
      detail: `${manufacturersAtRisk} suppliers are operating above the target lead-time band, and the current network averages ${Number(avgLeadTime.toFixed(1))} days. Improve supplier responsiveness or rebalance volume to faster partners.`
    });
  }

  if (!supplierInsights.length) {
    supplierInsights.push({
      id: "stable-board",
      area: "sales",
      tone: "good",
      title: "The board is stable",
      detail: "No major demand spikes or complaint patterns are standing out. Use this window to sharpen pricing, inventory accuracy, and supplier follow-up discipline."
    });
  }

  return NextResponse.json({
    kpis: {
      inboundLast7d: inboundLast7d.length,
      inventoryTotalSkus: inventory.length,
      inventoryLowStock: lowStock,
      inventoryOutOfStock: outOfStock,
      openSourcing,
      emailedSourcing,
      manufacturersTotal: manufacturers.length,
      manufacturersPreferred: preferredCount,
      manufacturersAtRisk,
      avgLeadTimeDays: Number(avgLeadTime.toFixed(1))
    },
    recentInbound,
    supplierInsights: supplierInsights.slice(0, 5),
    trends: {
      rfqQuote: rfqQuoteTrend,
      inventory: inventoryTrend
    }
  });
}
