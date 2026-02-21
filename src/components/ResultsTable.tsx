"use client";

import { QuoteLine } from "@/lib/types";
import { money, stockColor, stockLabel } from "@/lib/format";

export function ResultsTable({ lines }: { lines: QuoteLine[] }) {
  return (
    <div className="panel panel-aurora overflow-auto">
      <div className="mb-2">
        <div className="section-title">Parsed Output</div>
        <div className="font-semibold">Structured Product Table</div>
      </div>
      <table className="data-grid">
        <thead>
          <tr>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Product Type</th>
            <th className="py-2 pr-3">Grade</th>
            <th className="py-2 pr-3">Dimension</th>
            <th className="py-2 pr-3">Length</th>
            <th className="py-2 pr-3">Qty</th>
            <th className="py-2 pr-3">Unit Price</th>
            <th className="py-2 pr-3">Extended</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.sku || "na"}-${i}`}>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${stockColor(l.stockStatus)}`} />
                  <span>{stockLabel(l.stockStatus)}</span>
                </div>
              </td>
              <td className="py-2 pr-3">{l.requested.category || "-"}</td>
              <td className="py-2 pr-3">{l.requested.grade || "-"}</td>
              <td className="py-2 pr-3">{l.requested.dimensionSummary || "-"}</td>
              <td className="py-2 pr-3">
                {Number.isFinite(l.requested.length)
                  ? `${Number(l.requested.length).toFixed(2)} in`
                  : "-"}
              </td>
              <td className="py-2 pr-3">{l.quantity} {l.unit}</td>
              <td className="py-2 pr-3">{money(l.unitPrice)}</td>
              <td className="py-2 pr-3">{money(l.extendedPrice)}</td>
            </tr>
          ))}
          {!lines.length && (
            <tr>
              <td className="py-3 text-steel-600" colSpan={8}>No parsed product lines yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
