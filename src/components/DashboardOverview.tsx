"use client";

import { useEffect, useMemo, useState } from "react";

type DashboardPayload = {
  kpis: {
    inboundLast7d: number;
    inventoryTotalSkus: number;
    inventoryLowStock: number;
    inventoryOutOfStock: number;
    openSourcing: number;
    emailedSourcing: number;
    manufacturersTotal: number;
    manufacturersPreferred: number;
    manufacturersAtRisk: number;
    avgLeadTimeDays: number;
  };
  recentInbound: Array<{
    id: string;
    buyerName: string;
    fromEmail: string;
    subject: string;
    receivedAt: string;
  }>;
  trends: {
    rfqQuote: Array<{ month: string; rfqs: number; quotes: number }>;
    inventory: Array<{ month: string; demandQty: number; restockQty: number; netDelta: number; cumulativeDelta: number }>;
  };
};

const emptyData: DashboardPayload = {
  kpis: {
    inboundLast7d: 0,
    inventoryTotalSkus: 0,
    inventoryLowStock: 0,
    inventoryOutOfStock: 0,
    openSourcing: 0,
    emailedSourcing: 0,
    manufacturersTotal: 0,
    manufacturersPreferred: 0,
    manufacturersAtRisk: 0,
    avgLeadTimeDays: 0
  },
  recentInbound: [],
  trends: {
    rfqQuote: [],
    inventory: []
  }
};

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-steel-300 text-[10px] text-steel-600">i</span>
      <span className="pointer-events-none absolute left-1/2 top-[120%] z-20 hidden w-56 -translate-x-1/2 rounded-md border border-steel-200 bg-white p-2 text-[11px] text-steel-700 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function DualLineChart({ data }: { data: Array<{ month: string; rfqs: number; quotes: number }> }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const w = 620;
  const h = 220;
  const pad = { top: 18, right: 16, bottom: 28, left: 32 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const maxY = Math.max(1, ...data.map((d) => Math.max(d.rfqs, d.quotes)));
  const x = (i: number) => pad.left + (data.length <= 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
  const y = (v: number) => pad.top + chartH - (v / maxY) * chartH;
  const poly = (key: "rfqs" | "quotes") => data.map((d, i) => `${x(i)},${y(d[key])}`).join(" ");

  if (!data.length) return <div className="text-sm text-steel-600">No monthly data available yet.</div>;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <rect x={0} y={0} width={w} height={h} fill="transparent" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = pad.top + chartH * t;
          return <line key={t} x1={pad.left} y1={yy} x2={w - pad.right} y2={yy} stroke="#e2e8f0" strokeWidth="1" />;
        })}
        <polyline fill="none" stroke="#0f766e" strokeWidth="2.5" points={poly("rfqs")} />
        <polyline fill="none" stroke="#2563eb" strokeWidth="2.5" points={poly("quotes")} />
        {data.map((d, i) => (
          <g key={d.month}>
            <circle cx={x(i)} cy={y(d.rfqs)} r="4" fill="#0f766e" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
            <circle cx={x(i)} cy={y(d.quotes)} r="4" fill="#2563eb" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
            <text x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" fill="#64748b">{d.month}</text>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-700" /> RFQs</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Quotes</span>
      </div>
      {hovered !== null && (
        <div className="mt-2 rounded-md border border-steel-200 bg-steel-50 px-2 py-1 text-xs text-steel-700">
          {data[hovered].month}: RFQs {data[hovered].rfqs}, Quotes {data[hovered].quotes}
        </div>
      )}
    </div>
  );
}

function InventoryBarsChart({ data }: { data: Array<{ month: string; demandQty: number; restockQty: number; netDelta: number; cumulativeDelta: number }> }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxY = Math.max(1, ...data.map((d) => Math.max(d.demandQty, d.restockQty)));

  if (!data.length) return <div className="text-sm text-steel-600">No monthly inventory movement yet.</div>;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-6 gap-2">
        {data.map((d, i) => (
          <div key={d.month} className="rounded-md border border-steel-200 bg-white p-2 text-center" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <div className="mx-auto flex h-24 items-end justify-center gap-1">
              <div className="w-3 rounded-sm bg-rose-400" style={{ height: `${Math.max(6, (d.demandQty / maxY) * 96)}px` }} />
              <div className="w-3 rounded-sm bg-emerald-500" style={{ height: `${Math.max(6, (d.restockQty / maxY) * 96)}px` }} />
            </div>
            <div className="mt-1 text-[11px] text-steel-700">{d.month}</div>
          </div>
        ))}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-400" /> Quote Demand Qty</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Restock Qty</span>
      </div>
      {hovered !== null && (
        <div className="rounded-md border border-steel-200 bg-steel-50 px-2 py-1 text-xs text-steel-700">
          {data[hovered].month}: Demand {data[hovered].demandQty}, Restock {data[hovered].restockQty}, Net {data[hovered].netDelta >= 0 ? "+" : ""}{data[hovered].netDelta}
        </div>
      )}
    </div>
  );
}

export function DashboardOverview() {
  const [data, setData] = useState<DashboardPayload>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load dashboard");
      setData(json as DashboardPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const inventoryHealth = useMemo(() => {
    if (!data.kpis.inventoryTotalSkus) return "No inventory loaded";
    const riskRatio = (data.kpis.inventoryLowStock + data.kpis.inventoryOutOfStock) / data.kpis.inventoryTotalSkus;
    if (riskRatio > 0.35) return "Attention needed";
    if (riskRatio > 0.15) return "Monitor";
    return "Healthy";
  }, [data.kpis.inventoryLowStock, data.kpis.inventoryOutOfStock, data.kpis.inventoryTotalSkus]);

  return (
    <div className="space-y-4">
      <div className="panel panel-aurora flex items-center justify-between">
        <div>
          <div className="section-title">Dashboard</div>
          <div className="font-semibold">Operations Snapshot</div>
        </div>
        <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="kpi-card">
          <div className="flex items-center gap-1 text-xs text-steel-600">Inbound (7d) <InfoTip text="Inbound buyer emails received in the last 7 days." /></div>
          <div className="text-2xl font-semibold">{data.kpis.inboundLast7d}</div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-1 text-xs text-steel-600">Inventory Health <InfoTip text="Health based on low-stock (<1000) and out-of-stock SKU ratio." /></div>
          <div className="text-lg font-semibold">{inventoryHealth}</div>
          <div className="text-xs text-steel-600">{data.kpis.inventoryLowStock} low · {data.kpis.inventoryOutOfStock} out</div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-1 text-xs text-steel-600">Open Sourcing <InfoTip text="Sourcing requests currently in Open status." /></div>
          <div className="text-2xl font-semibold">{data.kpis.openSourcing}</div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-1 text-xs text-steel-600">Supplier Network <InfoTip text="Total active suppliers in your configured network." /></div>
          <div className="text-2xl font-semibold">{data.kpis.manufacturersTotal}</div>
          <div className="text-xs text-steel-600">{data.kpis.manufacturersPreferred} preferred</div>
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-1 text-xs text-steel-600">Avg Lead Time <InfoTip text="Average manufacturer lead-time days from supplier profiles." /></div>
          <div className="text-2xl font-semibold">{data.kpis.avgLeadTimeDays}d</div>
          <div className="text-xs text-steel-600">{data.kpis.manufacturersAtRisk} at risk</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="panel">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            RFQs vs Quotes (Past 6 Months)
            <InfoTip text="RFQs are inbound buyer requests. Quotes are created quote records in the same month." />
          </div>
          <DualLineChart data={data.trends.rfqQuote} />
        </div>
        <div className="panel">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            Inventory Change Trend (Past 6 Months)
            <InfoTip text="Estimated monthly movement: quote demand quantity vs inventory restock quantity from sourcing requests." />
          </div>
          <InventoryBarsChart data={data.trends.inventory} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="panel">
          <div className="mb-2 font-semibold">Recent Buyer Inbound</div>
          <div className="max-h-80 space-y-2 overflow-auto">
            {data.recentInbound.map((m) => (
              <div key={m.id} className="rounded-lg border border-steel-200 bg-steel-50 p-2">
                <div className="text-sm font-medium">{m.buyerName}</div>
                <div className="text-xs text-steel-600">{m.fromEmail}</div>
                <div className="text-sm">{m.subject || "(No subject)"}</div>
                <div className="text-xs text-steel-600">{new Date(m.receivedAt).toLocaleString()}</div>
              </div>
            ))}
            {!data.recentInbound.length && <div className="text-sm text-steel-600">No inbound messages yet.</div>}
          </div>
        </div>

        <div className="panel panel-aurora space-y-3">
          <div className="font-semibold">Workflow Signals</div>
          <div className="rounded-lg border border-steel-200 bg-steel-50 p-3 text-sm">
            <div className="font-medium">Buyer Intake</div>
            <div className="text-steel-700">
              {data.kpis.inboundLast7d > 0
                ? `${data.kpis.inboundLast7d} inbound messages this week.`
                : "No inbound buyer messages in the last 7 days."}
            </div>
          </div>
          <div className="rounded-lg border border-steel-200 bg-steel-50 p-3 text-sm">
            <div className="font-medium">Inventory Risk</div>
            <div className="text-steel-700">
              {data.kpis.inventoryLowStock + data.kpis.inventoryOutOfStock} SKUs need sourcing attention.
            </div>
          </div>
          <div className="rounded-lg border border-steel-200 bg-steel-50 p-3 text-sm">
            <div className="font-medium">Supplier Responsiveness</div>
            <div className="text-steel-700">
              {data.kpis.emailedSourcing} sourcing requests already emailed to manufacturers.
            </div>
          </div>
        </div>
      </div>

      {error && <div className="panel panel-aurora text-sm text-rose-600">{error}</div>}
    </div>
  );
}
