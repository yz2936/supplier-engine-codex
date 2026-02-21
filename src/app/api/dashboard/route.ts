import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { requireUser } from "@/lib/server-auth";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_COUNT = 6;

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

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
    trends: {
      rfqQuote: rfqQuoteTrend,
      inventory: inventoryTrend
    }
  });
}
