"use client";

import { QuoteLine } from "@/lib/types";
import { money, standardsLabel, stockColor, stockLabel, summarizeRequestedSpecs } from "@/lib/format";

export function ResultsTable({
  lines,
  onSourceItem
}: {
  lines: QuoteLine[];
  onSourceItem?: (line: QuoteLine) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="section-title">Parsed output</div>
          <div className="font-semibold">Priced product lines</div>
        </div>
        <div className="text-xs text-steel-500">{lines.length} item{lines.length === 1 ? "" : "s"}</div>
      </div>
      <div className="space-y-2">
        {lines.map((l, i) => {
          const specChips = summarizeRequestedSpecs(l.requested);
          const standards = standardsLabel(l.requested);
          return (
            <div key={`${l.sku || "na"}-${i}`} className="rounded-2xl border border-steel-200/80 bg-white/80 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${stockColor(l.stockStatus)}`} />
                    <span className="text-sm font-semibold text-steel-900">{l.requested.grade || "-"}</span>
                    <span className="rounded-full bg-steel-100 px-2 py-1 text-xs font-medium text-steel-700">{l.requested.category || "-"}</span>
                    <span className="text-xs text-steel-500">{stockLabel(l.stockStatus)}</span>
                  </div>
                  <div className="text-sm font-medium text-steel-800">{l.description}</div>
                  {specChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {specChips.map((spec) => (
                        <span key={spec} className="rounded-full border border-steel-200 bg-steel-50 px-2 py-1 text-[11px] text-steel-700">
                          {spec}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-1 text-xs text-steel-500 sm:grid-cols-2">
                    {standards && <div><span className="font-semibold text-steel-700">Standards:</span> {standards}</div>}
                    <div><span className="font-semibold text-steel-700">Source:</span> {l.requested.rawSpec}</div>
                  </div>
                </div>
                <div className="grid min-w-[180px] grid-cols-2 gap-2 text-sm lg:grid-cols-1 lg:text-right">
                  <div className="rounded-xl bg-steel-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-steel-500">Qty</div>
                    <div className="font-semibold text-steel-900">{l.quantity} {l.unit}</div>
                  </div>
                  <div className="rounded-xl bg-steel-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-steel-500">Unit</div>
                    <div className="font-semibold text-steel-900">{money(l.unitPrice)}</div>
                  </div>
                  <div className="col-span-2 rounded-xl bg-orange-50 px-3 py-2 lg:col-span-1">
                    <div className="text-[11px] uppercase tracking-wide text-steel-500">Extended</div>
                    <div className="font-semibold text-orange-700">{money(l.extendedPrice)}</div>
                  </div>
                  {onSourceItem && l.stockStatus === "red" && (
                    <button className="btn-secondary col-span-2 lg:col-span-1" onClick={() => onSourceItem(l)}>
                      Source This Item
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!lines.length && (
          <div className="rounded-2xl border border-dashed border-steel-300 bg-white/70 px-4 py-6 text-sm text-steel-600">
            No parsed product lines yet.
          </div>
        )}
      </div>
    </div>
  );
}
