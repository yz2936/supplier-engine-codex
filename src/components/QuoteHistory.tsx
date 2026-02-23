"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { Quote } from "@/lib/types";

export function QuoteHistory({ enabled }: { enabled: boolean }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const load = async () => {
    const res = await fetch("/api/quotes", { credentials: "include", cache: "no-store" });
    const json = await res.json();
    setQuotes(json.quotes || []);
  };

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="panel panel-aurora overflow-auto">
      <div className="mb-2 font-semibold">Quote History</div>
      <table className="data-grid">
        <thead>
          <tr>
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Customer</th>
            <th className="py-2 pr-3">Sent To</th>
            <th className="py-2 pr-3">Total</th>
            <th className="py-2 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id}>
              <td className="py-2 pr-3">{new Date(q.createdAt).toLocaleString()}</td>
              <td className="py-2 pr-3">{q.customerName}</td>
              <td className="py-2 pr-3">{q.sentToEmail || "-"}</td>
              <td className="py-2 pr-3">{money(q.totalPrice)}</td>
              <td className="py-2 pr-3">
                <select
                  className="input"
                  value={q.status}
                  onChange={async (e) => {
                    const status = e.target.value;
                    await fetch(`/api/quotes/${q.id}`, {
                      credentials: "include",
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status })
                    });
                    load();
                  }}
                >
                  <option>Draft</option>
                  <option>Sent</option>
                  <option>Won</option>
                </select>
              </td>
            </tr>
          ))}
          {!quotes.length && (
            <tr>
              <td colSpan={5} className="py-3 text-steel-600">No quotes saved yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
