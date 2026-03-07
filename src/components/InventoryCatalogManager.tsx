"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";

type InventoryItem = {
  sku: string;
  category: string;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  finish: string;
  weightPerUnit: number;
  basePrice: number;
  qtyOnHand: number;
  schedule?: string;
};

type Recommendation = {
  valuePerLb: number;
  source: "api" | "fallback_existing" | "fallback_default";
};

type SourceSeed = {
  sku: string;
  category: string;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  schedule?: string;
  qtyOnHand: number;
};

type Props = {
  editable: boolean;
  onSourceLine?: (seed: SourceSeed) => void;
};

export function InventoryCatalogManager({ editable, onSourceLine }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [draftBasePrice, setDraftBasePrice] = useState<Record<string, number>>({});
  const [draftQtyOnHand, setDraftQtyOnHand] = useState<Record<string, number>>({});
  const [recommendByGrade, setRecommendByGrade] = useState<Record<string, Recommendation>>({});
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [gradeFilter, setGradeFilter] = useState("All");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [onlyHighSurcharge, setOnlyHighSurcharge] = useState(false);
  const LOW_STOCK_THRESHOLD = 1000;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load inventory");

      const next = (json.inventory || []) as InventoryItem[];
      setItems(next);
      setDraftBasePrice(Object.fromEntries(next.map((i) => [i.sku, i.basePrice])));
      setDraftQtyOnHand(Object.fromEntries(next.map((i) => [i.sku, i.qtyOnHand])));

      const uniqueGrades = Array.from(new Set(next.map((i) => i.grade).filter(Boolean)));
      const recEntries = await Promise.all(uniqueGrades.map(async (grade) => {
        const r = await fetch(`/api/surcharges/recommend?grade=${encodeURIComponent(grade)}`, { credentials: "include", cache: "no-store" });
        if (!r.ok) return [grade, { valuePerLb: 0, source: "fallback_default" as const }] as const;
        const rec = await r.json();
        return [grade, { valuePerLb: Number(rec.valuePerLb ?? 0), source: rec.source as Recommendation["source"] }] as const;
      }));
      setRecommendByGrade(Object.fromEntries(recEntries));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => {
      void load();
    };
    window.addEventListener("inventory:refresh", onRefresh);
    return () => window.removeEventListener("inventory:refresh", onRefresh);
  }, [load]);

  const enriched = useMemo(
    () => items.map((item) => {
      const rec = recommendByGrade[item.grade] ?? { valuePerLb: 0, source: "fallback_default" as const };
      const suggested = Number((item.basePrice + rec.valuePerLb).toFixed(4));
      return { item, rec, suggested };
    }),
    [items, recommendByGrade]
  );

  const stockLevel = (qty: number) => {
    if (qty <= 0) return "out";
    if (qty <= LOW_STOCK_THRESHOLD) return "low";
    return "healthy";
  };

  const typeOptions = useMemo(
    () => ["All", ...Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort()],
    [items]
  );

  const gradeOptions = useMemo(
    () => ["All", ...Array.from(new Set(items.map((i) => i.grade).filter(Boolean))).sort()],
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter(({ item, rec }) => {
      const currentQty = draftQtyOnHand[item.sku] ?? item.qtyOnHand;
      if (typeFilter !== "All" && item.category !== typeFilter) return false;
      if (gradeFilter !== "All" && item.grade !== gradeFilter) return false;
      if (onlyLowStock && stockLevel(currentQty) === "healthy") return false;
      if (onlyHighSurcharge && rec.valuePerLb < 0.3) return false;
      if (!q) return true;
      const haystack = `${item.sku} ${item.category} ${item.grade} ${item.finish} ${item.schedule ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [draftQtyOnHand, enriched, gradeFilter, onlyHighSurcharge, onlyLowStock, query, typeFilter]);

  const totalRows = items.length;
  const lowRows = useMemo(
    () => items.filter((i) => (draftQtyOnHand[i.sku] ?? i.qtyOnHand) < LOW_STOCK_THRESHOLD).length,
    [draftQtyOnHand, items]
  );
  const outRows = useMemo(
    () => items.filter((i) => (draftQtyOnHand[i.sku] ?? i.qtyOnHand) <= 0).length,
    [draftQtyOnHand, items]
  );
  const avgSurcharge = useMemo(() => {
    const vals = Object.values(recommendByGrade).map((r) => r.valuePerLb).filter((v) => Number.isFinite(v));
    if (!vals.length) return 0;
    return vals.reduce((sum, v) => sum + v, 0) / vals.length;
  }, [recommendByGrade]);

  const topRestock = useMemo(
    () => items
      .map((item) => ({ item, qty: draftQtyOnHand[item.sku] ?? item.qtyOnHand }))
      .filter(({ qty }) => qty < LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 5),
    [draftQtyOnHand, items]
  );

  const topSurcharge = useMemo(
    () => enriched
      .slice()
      .sort((a, b) => b.rec.valuePerLb - a.rec.valuePerLb)
      .slice(0, 5),
    [enriched]
  );

  const saveRow = async (sku: string) => {
    const basePrice = draftBasePrice[sku];
    const qtyOnHand = draftQtyOnHand[sku];
    setMessage(`Saving ${sku}...`);
    const res = await fetch(`/api/inventory/${encodeURIComponent(sku)}`, {
      credentials: "include",
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basePrice, qtyOnHand })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error || `Failed to save ${sku}`);
      return;
    }
    setMessage(`Saved ${sku}`);
    await load();
  };

  const chipClass = (active: boolean) =>
    active
      ? "rounded-full border border-steel-700 bg-steel-700 px-3 py-1 text-xs text-white"
      : "rounded-full border border-steel-300 bg-white px-3 py-1 text-xs text-steel-700";

  const sourceThisLine = (item: InventoryItem, qtyOnHand: number) => {
    if (qtyOnHand >= LOW_STOCK_THRESHOLD) return;
    onSourceLine?.({
      sku: item.sku,
      category: item.category,
      grade: item.grade,
      thickness: item.thickness,
      width: item.width,
      length: item.length,
      schedule: item.schedule,
      qtyOnHand
    });
    setMessage(`Queued ${item.sku} for sourcing.`);
  };

  const hasDraftChanges = (item: InventoryItem) =>
    (draftQtyOnHand[item.sku] ?? item.qtyOnHand) !== item.qtyOnHand
    || (draftBasePrice[item.sku] ?? item.basePrice) !== item.basePrice;

  return (
    <div className="panel panel-aurora space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="section-title">Inventory Control</div>
          <div className="font-semibold">Inventory decision board</div>
        </div>
        <button className="btn-secondary" onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh Inventory"}</button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="kpi-card">
          <div className="text-xs text-steel-600">Total SKUs</div>
          <div className="text-lg font-semibold">{totalRows}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-steel-600">Under 1000</div>
          <div className="text-lg font-semibold text-amber-700">{lowRows}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-steel-600">Out of Stock</div>
          <div className="text-lg font-semibold text-rose-700">{outRows}</div>
        </div>
        <div className="kpi-card">
          <div className="text-xs text-steel-600">Avg Surcharge/lb</div>
          <div className="text-lg font-semibold">{money(avgSurcharge)}</div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-steel-200/80 bg-white/75 p-4">
          <div className="section-title">Action focus</div>
          <div className="mt-1 text-lg font-semibold text-steel-900">
            {outRows > 0
              ? `${outRows} SKUs are out of stock and should move to sourcing first.`
              : lowRows > 0
                ? `${lowRows} SKUs are below threshold and should be prioritized for replenishment.`
                : "Inventory is stable. Review pricing and surcharge recommendations next."}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={chipClass(onlyLowStock)} onClick={() => setOnlyLowStock((v) => !v)}>Focus Low Stock</button>
            <button className={chipClass(onlyHighSurcharge)} onClick={() => setOnlyHighSurcharge((v) => !v)}>Focus High Surcharge</button>
            <button className={chipClass(typeFilter === "Pipe")} onClick={() => setTypeFilter((v) => (v === "Pipe" ? "All" : "Pipe"))}>Pipe</button>
            <button className={chipClass(typeFilter === "Valve")} onClick={() => setTypeFilter((v) => (v === "Valve" ? "All" : "Valve"))}>Valve</button>
            <button className={chipClass(typeFilter === "Flange")} onClick={() => setTypeFilter((v) => (v === "Flange" ? "All" : "Flange"))}>Flange</button>
          </div>
        </div>

        <div className="rounded-2xl border border-steel-200/80 bg-steel-50/70 p-4">
          <div className="section-title">Visible set</div>
          <div className="mt-1 text-lg font-semibold text-steel-900">{filtered.length} rows in focus</div>
          <div className="mt-2 text-sm text-steel-600">
            Filters combine category, grade, stock risk, and surcharge pressure so the team can work a smaller queue.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <input
          className="input md:col-span-2"
          placeholder="Search SKU/type/grade..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          {typeOptions.map((v) => <option key={v}>{v}</option>)}
        </select>
        <select className="input" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
          {gradeOptions.map((v) => <option key={v}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded border border-steel-200 px-3 text-sm">
          <input type="checkbox" checked={onlyLowStock} onChange={(e) => setOnlyLowStock(e.target.checked)} />
          Under 1000 pcs
        </label>
        <label className="flex items-center gap-2 rounded border border-steel-200 px-3 text-sm">
          <input type="checkbox" checked={onlyHighSurcharge} onChange={(e) => setOnlyHighSurcharge(e.target.checked)} />
          High Surcharge Only
        </label>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/60 p-4">
          <div className="section-title">Restock queue</div>
          <div className="mt-3 space-y-2">
            {topRestock.map(({ item, qty }) => (
              <div key={item.sku} className="flex items-center justify-between rounded-xl bg-white/85 px-3 py-2">
                <div>
                  <div className="font-semibold text-steel-900">{item.sku}</div>
                  <div className="text-xs text-steel-600">{item.grade} {item.category} · {item.thickness} x {item.width} x {item.length}{item.schedule ? ` SCH ${item.schedule}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-rose-700">{qty}</div>
                  {editable && (
                    <button className="btn-secondary" onClick={() => sourceThisLine(item, qty)}>
                      Source
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!topRestock.length && <div className="text-sm text-steel-600">No urgent restock items.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4">
          <div className="section-title">Pricing watchlist</div>
          <div className="mt-3 space-y-2">
            {topSurcharge.map(({ item, rec, suggested }) => (
              <div key={item.sku} className="flex items-center justify-between rounded-xl bg-white/85 px-3 py-2">
                <div>
                  <div className="font-semibold text-steel-900">{item.sku}</div>
                  <div className="text-xs text-steel-600">{item.grade} · surcharge {money(rec.valuePerLb)} / suggested {money(suggested)}</div>
                </div>
                {editable && (
                  <button
                    className="btn-secondary"
                    onClick={() => setDraftBasePrice((p) => ({ ...p, [item.sku]: suggested }))}
                  >
                    Apply
                  </button>
                )}
              </div>
            ))}
            {!topSurcharge.length && <div className="text-sm text-steel-600">No pricing watchlist items yet.</div>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-steel-200 bg-steel-50 px-3 py-2 text-xs text-steel-700">
        Showing {filtered.length} of {items.length} products
      </div>

      <div className="overflow-auto">
        <table className="data-grid">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="py-2 pr-3">SKU</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Grade</th>
              <th className="py-2 pr-3">Dimension</th>
              <th className="py-2 pr-3">Qty</th>
              <th className="py-2 pr-3">Stock</th>
              <th className="py-2 pr-3">Base Price/lb</th>
              <th className="py-2 pr-3">Rec Surcharge/lb</th>
              <th className="py-2 pr-3">Suggested/lb</th>
              {editable && <th className="py-2 pr-3">Action</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ item, rec, suggested }) => {
              const currentQty = draftQtyOnHand[item.sku] ?? item.qtyOnHand;
              const level = stockLevel(currentQty);
              return (
                <tr
                  key={item.sku}
                  className={
                    level === "out"
                      ? "bg-rose-50/70"
                      : level === "low"
                        ? "bg-amber-50/60"
                        : "hover:bg-cyan-50/40"
                  }
                >
                <td className="py-2 pr-3">{item.sku}</td>
                <td className="py-2 pr-3">{item.category}</td>
                <td className="py-2 pr-3">{item.grade}</td>
                <td className="py-2 pr-3">{item.thickness} x {item.width} x {item.length}{item.schedule ? ` SCH ${item.schedule}` : ""}</td>
                <td className="py-2 pr-3">
                  {editable ? (
                    <input
                      className="input w-24"
                      type="number"
                      step="1"
                      value={currentQty}
                      onChange={(e) => setDraftQtyOnHand((p) => ({ ...p, [item.sku]: Number(e.target.value || 0) }))}
                    />
                  ) : currentQty}
                </td>
                <td className="py-2 pr-3">
                  {level === "healthy" && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Healthy</span>}
                  {level === "low" && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">Low (&lt;1000)</span>}
                  {level === "out" && <span className="rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-700">Out</span>}
                </td>
                <td className="py-2 pr-3">
                  {editable ? (
                    <input
                      className="input w-28"
                      type="number"
                      step="0.0001"
                      value={draftBasePrice[item.sku] ?? item.basePrice}
                      onChange={(e) => setDraftBasePrice((p) => ({ ...p, [item.sku]: Number(e.target.value || 0) }))}
                    />
                  ) : money(item.basePrice)}
                </td>
                <td className="py-2 pr-3">
                  {money(rec.valuePerLb)}<div className="text-xs text-steel-600">{rec.source === "api" ? "raw API" : "fallback"}</div>
                </td>
                <td className="py-2 pr-3">{money(suggested)}</td>
                {editable && (
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      {currentQty < LOW_STOCK_THRESHOLD && (
                        <button className="btn-secondary" onClick={() => sourceThisLine(item, currentQty)}>
                          Source This Line
                        </button>
                      )}
                      <button
                        className="btn-secondary"
                        onClick={() => setDraftBasePrice((p) => ({ ...p, [item.sku]: suggested }))}
                      >
                        Apply Rec
                      </button>
                      <button className="btn" onClick={() => saveRow(item.sku)}>Save</button>
                    </div>
                    {hasDraftChanges(item) && <div className="mt-1 text-xs text-amber-700">Unsaved edits</div>}
                  </td>
                )}
              </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td className="py-3 text-steel-600" colSpan={editable ? 10 : 9}>No products match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <div className="text-xs text-steel-700">{message}</div>}
    </div>
  );
}
