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
      <div className="overflow-auto rounded-2xl border border-steel-200/80 bg-white/85">
        <table className="data-grid min-w-[960px] border-0">
          <thead>
            <tr>
              <th>Status</th>
              <th>Product</th>
              <th>Specs</th>
              <th>Standards</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Extended</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const specs = summarizeRequestedSpecs(l.requested).join(" | ");
              const standards = standardsLabel(l.requested);
              return (
                <tr key={`${l.sku || "na"}-${i}`}>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${stockColor(l.stockStatus)}`} />
                      <span className="text-xs text-steel-700">{stockLabel(l.stockStatus)}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-steel-900">{l.requested.grade} {l.requested.category}</div>
                    <div className="max-w-[280px] truncate text-xs text-steel-500">{l.description}</div>
                  </td>
                  <td className="py-3 pr-3 text-xs text-steel-700">{specs || "-"}</td>
                  <td className="py-3 pr-3 text-xs text-steel-600">{standards || "-"}</td>
                  <td className="py-3 pr-3 text-sm text-steel-900">{l.quantity} {l.unit}</td>
                  <td className="py-3 pr-3 text-sm text-steel-900">{money(l.unitPrice)} / {l.unit}</td>
                  <td className="py-3 pr-3 font-medium text-orange-700">{money(l.extendedPrice)}</td>
                  <td className="py-3 pr-3">
                    {onSourceItem && l.stockStatus === "red"
                      ? <button className="btn-secondary whitespace-nowrap" onClick={() => onSourceItem(l)}>Source Item</button>
                      : <span className="text-xs text-steel-400">-</span>}
                  </td>
                </tr>
              );
            })}
            {!lines.length && (
              <tr>
                <td className="py-6 text-sm text-steel-600" colSpan={8}>No parsed product lines yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
