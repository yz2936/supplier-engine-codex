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

function MetricCard({
  title,
  value,
  subtitle,
  change,
  icon
}: {
  title: string;
  value: string;
  subtitle: string;
  change?: string;
  icon: string;
}) {
  return (
    <div className="kpi-card rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(15,23,42,0.14)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-steel-600">{title}</div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-lg text-orange-600">{icon}</div>
      </div>
      <div className="font-['Sora'] text-4xl font-semibold text-steel-900">{value}</div>
      <div className="mt-2 text-sm text-steel-600">{subtitle}</div>
      <div className="mt-2 text-sm font-semibold text-emerald-600">{change || "Stable"}</div>
    </div>
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
        <polyline fill="none" stroke="#f97316" strokeWidth="2.8" points={poly("rfqs")} />
        <polyline fill="none" stroke="#1d4ed8" strokeWidth="2.8" points={poly("quotes")} />
        {data.map((d, i) => (
          <g key={d.month}>
            <circle cx={x(i)} cy={y(d.rfqs)} r="4" fill="#f97316" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
            <circle cx={x(i)} cy={y(d.quotes)} r="4" fill="#1d4ed8" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
            <text x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" fill="#64748b">{d.month}</text>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> RFQs</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-700" /> Quotes</span>
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
            <div
              key={d.month}
              className="rounded-md border border-steel-200 bg-white p-2 text-center transition hover:border-orange-300"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
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

function RadialGauge({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const size = 220;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#f97316"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="-mt-[135px] text-center">
        <div className="font-['Sora'] text-5xl font-semibold text-steel-900">{Math.round(clamped)}%</div>
        <div className="text-sm text-steel-600">{label}</div>
      </div>
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

  const inventoryHealthPercent = useMemo(() => {
    if (!data.kpis.inventoryTotalSkus) return 0;
    const healthy = Math.max(0, data.kpis.inventoryTotalSkus - data.kpis.inventoryLowStock - data.kpis.inventoryOutOfStock);
    return (healthy / data.kpis.inventoryTotalSkus) * 100;
  }, [data.kpis.inventoryLowStock, data.kpis.inventoryOutOfStock, data.kpis.inventoryTotalSkus]);

  return (
    <div className="space-y-4">
      <div className="panel panel-aurora flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title">Dashboard</div>
          <h3 className="font-['Sora'] text-3xl font-semibold text-steel-900">Command Center</h3>
          <p className="text-steel-700">Welcome back. Here&apos;s your sourcing and quoting overview.</p>
        </div>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Inbound Requests"
          value={String(data.kpis.inboundLast7d)}
          subtitle="Buyer inbound emails, last 7 days"
          change="Active pipeline"
          icon="✉"
        />
        <MetricCard
          title="Open Sourcing"
          value={String(data.kpis.openSourcing)}
          subtitle="Requests not yet closed"
          change={`${data.kpis.emailedSourcing} already sent`}
          icon="⛓"
        />
        <MetricCard
          title="Inventory Health"
          value={inventoryHealth}
          subtitle={`${data.kpis.inventoryLowStock} low, ${data.kpis.inventoryOutOfStock} out`}
          change="Monitor shortage"
          icon="📦"
        />
        <MetricCard
          title="Supplier Network"
          value={String(data.kpis.manufacturersTotal)}
          subtitle={`${data.kpis.manufacturersPreferred} preferred suppliers`}
          change={`${data.kpis.avgLeadTimeDays}d avg lead time`}
          icon="🏭"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.9fr]">
        <div className="panel space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-steel-900">
              Recent Buyer Inbound
              <InfoTip text="Most recent inbound buyer emails routed to your team." />
            </div>
            <div className="text-xs text-steel-500">{data.recentInbound.length} conversations</div>
          </div>
          <div className="max-h-[330px] space-y-2 overflow-auto pr-1">
            {data.recentInbound.map((m) => (
              <div key={m.id} className="rounded-xl border border-steel-200 bg-white/85 p-3 transition hover:border-orange-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-steel-900">{m.buyerName}</div>
                  <div className="text-xs text-steel-600">{new Date(m.receivedAt).toLocaleString()}</div>
                </div>
                <div className="text-xs text-steel-600">{m.fromEmail}</div>
                <div className="mt-1 text-sm text-steel-800">{m.subject || "(No subject)"}</div>
              </div>
            ))}
            {!data.recentInbound.length && <div className="text-sm text-steel-600">No inbound messages yet.</div>}
          </div>
        </div>

        <div className="panel panel-aurora space-y-3">
          <div className="flex items-center gap-2 font-semibold text-steel-900">
            Inventory Occupancy
            <InfoTip text="Share of SKUs currently in healthy stock status, excluding low/out-of-stock lines." />
          </div>
          <RadialGauge value={inventoryHealthPercent} label="Healthy Stock" />
          <div className="rounded-xl border border-steel-200 bg-white/80 p-3 text-sm text-steel-700">
            Total SKUs: {data.kpis.inventoryTotalSkus} · At Risk: {data.kpis.inventoryLowStock + data.kpis.inventoryOutOfStock}
          </div>
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

      {error && <div className="panel panel-aurora text-sm text-rose-600">{error}</div>}
    </div>
  );
}
