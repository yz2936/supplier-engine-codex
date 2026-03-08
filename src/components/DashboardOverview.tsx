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

function MetricCard({
  title,
  value,
  subtitle,
  change,
  tone = "default"
}: {
  title: string;
  value: string;
  subtitle: string;
  change?: string;
  tone?: "default" | "warn" | "good";
}) {
  const toneClass = tone === "warn"
    ? "border-amber-200/80 bg-amber-50/70"
    : tone === "good"
      ? "border-emerald-200/80 bg-emerald-50/60"
      : "";
  return (
    <div className={`kpi-card rounded-2xl p-4 ${toneClass}`}>
      <div className="mb-3 text-sm font-semibold text-steel-600">{title}</div>
      <div className="font-['Sora'] text-4xl font-semibold text-steel-900">{value}</div>
      <div className="mt-2 text-sm text-steel-600">{subtitle}</div>
      <div className="mt-2 text-sm font-semibold text-steel-800">{change || "Stable"}</div>
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

function StockReadiness({ healthyPercent, totalSkus, atRisk }: { healthyPercent: number; totalSkus: number; atRisk: number }) {
  const clamped = Math.max(0, Math.min(100, healthyPercent));
  return (
    <div className="space-y-4">
      <div>
        <div className="text-4xl font-['Sora'] font-semibold text-steel-900">{Math.round(clamped)}%</div>
        <div className="text-sm text-steel-600">Healthy stock coverage</div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-steel-100">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${clamped}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-white/85 p-3">
          <div className="text-[11px] uppercase tracking-wide text-steel-500">Total SKUs</div>
          <div className="mt-1 font-semibold text-steel-900">{totalSkus}</div>
        </div>
        <div className="rounded-xl bg-white/85 p-3">
          <div className="text-[11px] uppercase tracking-wide text-steel-500">At risk</div>
          <div className="mt-1 font-semibold text-steel-900">{atRisk}</div>
        </div>
      </div>
    </div>
  );
}

export function DashboardOverview({
  onNavigateView
}: {
  onNavigateView?: (view: "quote_desk" | "inventory" | "sourcing" | "buyers" | "quotes") => void;
}) {
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

  const actionItems = useMemo(() => {
    const items: Array<{
      title: string;
      detail: string;
      cta: string;
      view: "quote_desk" | "inventory" | "sourcing" | "buyers" | "quotes";
    }> = [];

    if (data.kpis.inboundLast7d > 0) {
      items.push({
        title: "Work the inbound queue",
        detail: `${data.kpis.inboundLast7d} inbound sourcing requests landed in the last 7 days.`,
        cta: "Open Buyers",
        view: "buyers"
      });
    }
    if (data.kpis.inventoryOutOfStock > 0 || data.kpis.inventoryLowStock > 0) {
      items.push({
        title: "Resolve stock risk",
        detail: `${data.kpis.inventoryOutOfStock} SKUs are out and ${data.kpis.inventoryLowStock} are low.`,
        cta: "Open Inventory",
        view: "inventory"
      });
    }
    if (data.kpis.openSourcing > 0) {
      items.push({
        title: "Push supplier follow-up",
        detail: `${data.kpis.openSourcing} sourcing requests are still open.`,
        cta: "Open Sourcing",
        view: "sourcing"
      });
    }
    items.push({
      title: "Start a new quote",
      detail: "Move a qualified sourcing request into pricing and quote generation.",
      cta: "Open Quote Desk",
      view: "quote_desk"
    });

    return items.slice(0, 4);
  }, [data.kpis.inboundLast7d, data.kpis.inventoryLowStock, data.kpis.inventoryOutOfStock, data.kpis.openSourcing]);

  const decisionSummary = useMemo(() => {
    if (data.kpis.openSourcing > 0) return "Supplier follow-up is the current bottleneck.";
    if (data.kpis.inventoryOutOfStock > 0) return "Inventory gaps are the main fulfillment risk.";
    if (data.kpis.inboundLast7d > 0) return "Inbound demand is active and needs qualification.";
    return "Pipeline is stable. Use this window to clean pricing and inventory data.";
  }, [data.kpis.inboundLast7d, data.kpis.inventoryOutOfStock, data.kpis.openSourcing]);

  return (
    <div className="space-y-4">
      <div className="panel panel-aurora flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title">Dashboard</div>
          <h3 className="font-['Sora'] text-3xl font-semibold text-steel-900">Decision board</h3>
          <p className="text-steel-700">{decisionSummary}</p>
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
        />
        <MetricCard
          title="Open Sourcing"
          value={String(data.kpis.openSourcing)}
          subtitle="Requests not yet closed"
          change={`${data.kpis.emailedSourcing} already sent`}
          tone={data.kpis.openSourcing > 0 ? "warn" : "default"}
        />
        <MetricCard
          title="Inventory Health"
          value={inventoryHealth}
          subtitle={`${data.kpis.inventoryLowStock} low, ${data.kpis.inventoryOutOfStock} out`}
          change="Monitor shortage"
          tone={inventoryHealth === "Healthy" ? "good" : "warn"}
        />
        <MetricCard
          title="Supplier Network"
          value={String(data.kpis.manufacturersTotal)}
          subtitle={`${data.kpis.manufacturersPreferred} preferred suppliers`}
          change={`${data.kpis.avgLeadTimeDays}d avg lead time`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.9fr]">
        <div className="panel space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="section-title">Action queue</div>
              <div className="font-semibold text-steel-900">What needs attention now</div>
            </div>
            <div className="text-xs text-steel-500">{actionItems.length} active items</div>
          </div>
          <div className="space-y-2">
            {actionItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-steel-200 bg-white/85 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-steel-900">{item.title}</div>
                    <div className="mt-1 text-sm text-steel-600">{item.detail}</div>
                  </div>
                  <button className="btn-secondary" onClick={() => onNavigateView?.(item.view)}>
                    {item.cta}
                  </button>
                </div>
              </div>
            ))}
            {!actionItems.length && <div className="text-sm text-steel-600">No urgent actions right now.</div>}
          </div>
        </div>

        <div className="panel panel-aurora space-y-3">
          <div>
            <div className="section-title">Stock readiness</div>
            <div className="font-semibold text-steel-900">Current inventory posture</div>
          </div>
          <StockReadiness
            healthyPercent={inventoryHealthPercent}
            totalSkus={data.kpis.inventoryTotalSkus}
            atRisk={data.kpis.inventoryLowStock + data.kpis.inventoryOutOfStock}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="panel">
          <div className="mb-2">
            <div className="section-title">Trend</div>
            <div className="font-semibold">RFQs vs quotes</div>
          </div>
          <DualLineChart data={data.trends.rfqQuote} />
        </div>
        <div className="panel">
          <div className="mb-2">
            <div className="section-title">Trend</div>
            <div className="font-semibold">Inventory demand vs restock</div>
          </div>
          <InventoryBarsChart data={data.trends.inventory} />
        </div>
      </div>

      <div className="panel space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="section-title">Recent inbound</div>
            <div className="font-semibold text-steel-900">Latest buyer activity</div>
          </div>
          <button className="btn-secondary" onClick={() => onNavigateView?.("buyers")}>Open Buyers</button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.recentInbound.map((m) => (
            <div key={m.id} className="rounded-xl border border-steel-200 bg-white/85 p-3">
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

      {error && <div className="panel panel-aurora text-sm text-rose-600">{error}</div>}
    </div>
  );
}
