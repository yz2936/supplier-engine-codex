"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QuantityUnit, QuoteLine } from "@/lib/types";

type Manufacturer = {
  id: string;
  name: string;
  email: string;
  specialties: string[];
  leadTimeDays?: number;
  preferred: boolean;
};

type InventoryItem = {
  sku: string;
  category: string;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  qtyOnHand: number;
  schedule?: string;
};

type SourcingRequest = {
  id: string;
  customerName?: string;
  manufacturerId: string;
  manufacturerName: string;
  manufacturerEmail?: string;
  status: "Open" | "Quoted" | "Closed";
  sourceContext: "quote_shortage" | "inventory_restock";
  reason: "low_stock" | "out_of_stock" | "new_demand";
  items: Array<{ productType: string; grade: string; quantity: number; unit: QuantityUnit; dimension?: string }>;
  notes?: string;
  lastEmailedAt?: string;
  lastEmailSubject?: string;
  createdAt: string;
};

type Candidate = {
  key: string;
  sourceContext: "quote_shortage" | "inventory_restock";
  reason: "low_stock" | "out_of_stock" | "new_demand";
  sku?: string;
  productType: string;
  grade: string;
  dimension?: string;
  quantity: number;
  unit: QuantityUnit;
  requestedLength?: number;
};

type InventorySeed = {
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
  customerName: string;
  quoteLines: QuoteLine[];
  initialInventorySeed?: InventorySeed;
  initialQuoteSeed?: Candidate;
  onSeedConsumed?: () => void;
};

const sortManufacturers = (list: Manufacturer[]) => [...list].sort((a, b) => {
  if (a.preferred === b.preferred) return a.name.localeCompare(b.name);
  return a.preferred ? -1 : 1;
});

export function SourcingHub({ customerName, quoteLines, initialInventorySeed, initialQuoteSeed, onSeedConsumed }: Props) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [requests, setRequests] = useState<SourcingRequest[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [manualCandidates, setManualCandidates] = useState<Candidate[]>([]);
  const [manufacturerId, setManufacturerId] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidateFilter, setCandidateFilter] = useState<"all" | "quote_shortage" | "inventory_restock">("all");
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierSpecialties, setSupplierSpecialties] = useState("");
  const [supplierLeadTime, setSupplierLeadTime] = useState<number>(14);
  const [supplierPreferred, setSupplierPreferred] = useState(false);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [emailingRequestId, setEmailingRequestId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const load = useCallback(async () => {
    const [invRes, manRes, reqRes] = await Promise.all([
      fetch("/api/inventory", { credentials: "include", cache: "no-store" }),
      fetch("/api/manufacturers", { credentials: "include", cache: "no-store" }),
      fetch("/api/sourcing", { credentials: "include", cache: "no-store" })
    ]);
    const [invJson, manJson, reqJson] = await Promise.all([invRes.json(), manRes.json(), reqRes.json()]);

    if (invRes.ok) setInventory(invJson.inventory || []);
    if (manRes.ok) {
      const list = sortManufacturers(manJson.manufacturers || []);
      setManufacturers(list);
      if ((!manufacturerId || !list.some((m: Manufacturer) => m.id === manufacturerId)) && list[0]?.id) {
        setManufacturerId(list[0].id);
      }
    }
    if (reqRes.ok) setRequests(reqJson.requests || []);
  }, [manufacturerId]);

  useEffect(() => {
    load();
  }, [load]);

  const quoteShortages: Candidate[] = useMemo(
    () =>
      quoteLines
        .filter((l) => l.stockStatus === "yellow" || l.stockStatus === "red")
        .map((l, i) => ({
          key: `q-${i}-${l.sku ?? l.description}`,
          sourceContext: "quote_shortage" as const,
          reason: l.stockStatus === "red" ? "out_of_stock" as const : "low_stock" as const,
          sku: l.sku,
          productType: l.requested.category,
          grade: l.requested.grade,
          dimension: l.requested.dimensionSummary,
          quantity: l.quantity,
          unit: l.unit,
          requestedLength: l.requested.length
        })),
    [quoteLines]
  );

  const inventoryRestock: Candidate[] = useMemo(
    () =>
      inventory
        .filter((i) => i.qtyOnHand < 1000)
        .map((i) => ({
          key: `i-${i.sku}`,
          sourceContext: "inventory_restock" as const,
          reason: (i.qtyOnHand <= 0 ? "out_of_stock" : "low_stock") as "out_of_stock" | "low_stock",
          sku: i.sku,
          productType: i.category,
          grade: i.grade,
          dimension: `${i.thickness} x ${i.width} x ${i.length}${i.schedule ? ` SCH ${i.schedule}` : ""}`,
          quantity: Math.max(1, 1000 - i.qtyOnHand),
          unit: "pcs" as const,
          requestedLength: i.length
        })),
    [inventory]
  );

  useEffect(() => {
    if (!initialInventorySeed) return;

    const seeded: Candidate = {
      key: `i-${initialInventorySeed.sku}`,
      sourceContext: "inventory_restock",
      reason: initialInventorySeed.qtyOnHand <= 0 ? "out_of_stock" : "low_stock",
      sku: initialInventorySeed.sku,
      productType: initialInventorySeed.category,
      grade: initialInventorySeed.grade,
      dimension: `${initialInventorySeed.thickness} x ${initialInventorySeed.width} x ${initialInventorySeed.length}${initialInventorySeed.schedule ? ` SCH ${initialInventorySeed.schedule}` : ""}`,
      quantity: Math.max(1, 1000 - initialInventorySeed.qtyOnHand),
      unit: "pcs",
      requestedLength: initialInventorySeed.length
    };

    setManualCandidates((prev) => {
      const next = prev.filter((c) => c.key !== seeded.key);
      next.push(seeded);
      return next;
    });

    setCandidateFilter("inventory_restock");
    setSelectedKeys((prev) => ({ ...prev, [seeded.key]: true }));
    setStatus(`Loaded ${initialInventorySeed.sku} into sourcing candidates.`);
    onSeedConsumed?.();
  }, [initialInventorySeed, onSeedConsumed]);

  useEffect(() => {
    if (!initialQuoteSeed) return;

    setManualCandidates((prev) => {
      const next = prev.filter((c) => c.key !== initialQuoteSeed.key);
      next.push(initialQuoteSeed);
      return next;
    });

    setCandidateFilter("quote_shortage");
    setSelectedKeys((prev) => ({ ...prev, [initialQuoteSeed.key]: true }));
    setStatus(`Loaded ${initialQuoteSeed.productType} into sourcing candidates.`);
    onSeedConsumed?.();
  }, [initialQuoteSeed, onSeedConsumed]);

  const candidates = useMemo(() => {
    const byKey = new Map<string, Candidate>();
    for (const c of quoteShortages) byKey.set(c.key, c);
    for (const c of inventoryRestock) byKey.set(c.key, c);
    for (const c of manualCandidates) byKey.set(c.key, c);
    return Array.from(byKey.values());
  }, [inventoryRestock, manualCandidates, quoteShortages]);

  const visibleCandidates = useMemo(
    () => candidateFilter === "all" ? candidates : candidates.filter((c) => c.sourceContext === candidateFilter),
    [candidateFilter, candidates]
  );

  const selected = candidates.filter((c) => selectedKeys[c.key]);

  const createRequest = async () => {
    if (!selected.length) return setStatus("Select at least one item to source.");
    if (!manufacturerId) return setStatus("Select a manufacturer.");

    setBusy(true);
    setStatus("Creating sourcing request...");
    try {
      const primary = selected[0];
      const res = await fetch("/api/sourcing", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName || undefined,
          manufacturerId,
          sourceContext: primary.sourceContext,
          reason: primary.reason,
          notes,
          items: selected.map((s) => ({
            sku: s.sku,
            productType: s.productType,
            grade: s.grade,
            dimension: s.dimension,
            quantity: s.quantity,
            unit: s.unit,
            requestedLength: s.requestedLength
          }))
        })
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) throw new Error("Session expired. Please log in again.");
        if (res.status === 403) throw new Error("Your account role is not allowed to create sourcing requests.");
        throw new Error(json.error || "Failed to create sourcing request");
      }
      setStatus("Sourcing request created.");
      setSelectedKeys({});
      setNotes("");
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create sourcing request");
    } finally {
      setBusy(false);
    }
  };

  const openEmailComposer = (request: SourcingRequest) => {
    const recipient = request.manufacturerEmail
      || manufacturers.find((m) => m.id === request.manufacturerId)?.email
      || "";
    const reasonText = request.reason === "out_of_stock"
      ? "out-of-stock replenishment"
      : request.reason === "low_stock"
        ? "low-stock replenishment"
        : "new demand";
    const defaultSubject = `Sourcing RFQ Request ${request.id.slice(0, 8)} - ${request.manufacturerName}`;
    const defaultBody = [
      "Hello,",
      "",
      `Please quote the following items for ${reasonText}${request.customerName ? ` (customer: ${request.customerName})` : ""}:`,
      "",
      ...request.items.map((item, i) =>
        `${i + 1}. ${item.productType} | Grade ${item.grade}${item.dimension ? ` | ${item.dimension}` : ""} | Qty ${item.quantity} ${item.unit}`
      ),
      "",
      "Please include unit price, MOQ, and earliest shipment ETA.",
      request.notes ? `Context: ${request.notes}` : "",
      "",
      "Thank you."
    ].filter(Boolean).join("\n");

    setEmailingRequestId(request.id);
    setEmailTo(recipient);
    setEmailSubject(request.lastEmailSubject || defaultSubject);
    setEmailBody(defaultBody);
  };

  const sendManufacturerEmail = async () => {
    if (!emailingRequestId) return;
    setEmailBusy(true);
    setStatus("Sending sourcing email...");
    try {
      const res = await fetch(`/api/sourcing/${encodeURIComponent(emailingRequestId)}/email`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          message: emailBody
        })
      });
      const raw = await res.text();
      let payload: { message?: string; error?: string } = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = { error: raw || "Unexpected server response" };
      }
      if (!res.ok) throw new Error(payload.error || "Failed to send sourcing email");

      setStatus(payload.message || "Sourcing email sent.");
      setEmailingRequestId(null);
      setEmailTo("");
      setEmailSubject("");
      setEmailBody("");
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to send sourcing email");
    } finally {
      setEmailBusy(false);
    }
  };

  const addSupplier = async () => {
    setNetworkBusy(true);
    setStatus("Adding supplier to network...");
    try {
      const res = await fetch("/api/manufacturers", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: supplierName,
          email: supplierEmail,
          specialties: supplierSpecialties,
          leadTimeDays: supplierLeadTime,
          preferred: supplierPreferred
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add supplier");
      setSupplierName("");
      setSupplierEmail("");
      setSupplierSpecialties("");
      setSupplierLeadTime(14);
      setSupplierPreferred(false);
      setStatus("Supplier added to your network.");
      if (Array.isArray(json.manufacturers) && json.manufacturers.length) {
        setManufacturers(sortManufacturers(json.manufacturers));
      } else if (json.manufacturer) {
        setManufacturers((prev) => sortManufacturers([...prev, json.manufacturer]));
      }
      if (json.manufacturer?.id) setManufacturerId(json.manufacturer.id);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to add supplier");
    } finally {
      setNetworkBusy(false);
    }
  };

  const setPreferredSupplier = async (id: string) => {
    setNetworkBusy(true);
    setStatus("Updating preferred supplier...");
    try {
      const res = await fetch(`/api/manufacturers/${encodeURIComponent(id)}`, {
        credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred: true })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update preferred supplier");
      setStatus("Preferred supplier updated.");
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update preferred supplier");
    } finally {
      setNetworkBusy(false);
    }
  };

  const removeSupplier = async (id: string) => {
    setNetworkBusy(true);
    setStatus("Removing supplier...");
    try {
      const res = await fetch(`/api/manufacturers/${encodeURIComponent(id)}`, {
        credentials: "include", method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to remove supplier");
      setStatus("Supplier removed from network.");
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to remove supplier");
    } finally {
      setNetworkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="section-title">Upstream Sourcing</div>
        <div className="mt-1 text-sm text-steel-700">
          Source low/out-of-stock products from preferred manufacturers. Build requests from quote shortages and out-of-stock inventory.
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="kpi-card">
            <div className="text-xs text-steel-600">Candidates</div>
            <div className="text-lg font-semibold">{candidates.length}</div>
          </div>
          <div className="kpi-card">
            <div className="text-xs text-steel-600">From Quote</div>
            <div className="text-lg font-semibold">{quoteShortages.length}</div>
          </div>
          <div className="kpi-card">
            <div className="text-xs text-steel-600">From Inventory</div>
            <div className="text-lg font-semibold">{inventoryRestock.length}</div>
          </div>
          <div className="kpi-card">
            <div className="text-xs text-steel-600">Selected</div>
            <div className="text-lg font-semibold">{selected.length}</div>
          </div>
        </div>
      </div>

      <div className="panel panel-aurora space-y-3">
        <div className="font-semibold">Supplier Network</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <input
            className="input"
            placeholder="Supplier name"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Supplier email"
            value={supplierEmail}
            onChange={(e) => setSupplierEmail(e.target.value)}
          />
          <input
            className="input md:col-span-2"
            placeholder="Specialties (comma separated)"
            value={supplierSpecialties}
            onChange={(e) => setSupplierSpecialties(e.target.value)}
          />
          <input
            className="input"
            type="number"
            min={1}
            placeholder="Lead time (days)"
            value={supplierLeadTime}
            onChange={(e) => setSupplierLeadTime(Number(e.target.value || 14))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={supplierPreferred}
              onChange={(e) => setSupplierPreferred(e.target.checked)}
            />
            Set as preferred supplier
          </label>
          <button
            className="btn"
            disabled={networkBusy || !supplierName.trim() || !supplierEmail.trim()}
            onClick={addSupplier}
          >
            {networkBusy ? "Saving..." : "Add Supplier"}
          </button>
        </div>
        <div className="overflow-auto rounded-xl border border-steel-200">
          <table className="min-w-full text-sm">
            <thead className="bg-steel-50">
              <tr className="border-b border-steel-200 text-left">
                <th className="py-2 px-3">Supplier</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Specialties</th>
                <th className="py-2 pr-3">Lead Time</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {manufacturers.map((m) => (
                <tr key={m.id} className="border-b border-steel-100">
                  <td className="py-2 px-3">
                    {m.name}
                    {m.preferred && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-800">Preferred</span>}
                  </td>
                  <td className="py-2 pr-3">{m.email}</td>
                  <td className="py-2 pr-3">{m.specialties.join(", ")}</td>
                  <td className="py-2 pr-3">{m.leadTimeDays ? `${m.leadTimeDays}d` : "-"}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      {!m.preferred && (
                        <button className="btn-secondary" disabled={networkBusy} onClick={() => setPreferredSupplier(m.id)}>
                          Set Preferred
                        </button>
                      )}
                      <button className="btn-secondary" disabled={networkBusy} onClick={() => removeSupplier(m.id)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!manufacturers.length && (
                <tr>
                  <td className="py-3 px-3 text-steel-600" colSpan={5}>No suppliers in your network yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel panel-aurora space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Candidate Items</div>
          <div className="flex flex-wrap gap-2">
            <button className={candidateFilter === "all" ? "btn" : "btn-secondary"} onClick={() => setCandidateFilter("all")}>All</button>
            <button className={candidateFilter === "quote_shortage" ? "btn" : "btn-secondary"} onClick={() => setCandidateFilter("quote_shortage")}>Quote Shortage</button>
            <button className={candidateFilter === "inventory_restock" ? "btn" : "btn-secondary"} onClick={() => setCandidateFilter("inventory_restock")}>Inventory Restock</button>
          </div>
        </div>
        <div className="max-h-72 overflow-auto rounded-xl border border-steel-200">
          <table className="min-w-full text-sm">
            <thead className="bg-steel-50">
              <tr className="border-b border-steel-200 text-left">
                <th className="py-2 px-2">Select</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Grade</th>
                <th className="py-2 pr-3">Dimension</th>
                <th className="py-2 pr-3">Qty</th>
              </tr>
            </thead>
            <tbody>
              {visibleCandidates.map((c) => (
                <tr key={c.key} className="border-b border-steel-100">
                  <td className="py-2 px-2">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedKeys[c.key])}
                      onChange={(e) => setSelectedKeys((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                    />
                  </td>
                  <td className="py-2 pr-3">{c.sourceContext === "quote_shortage" ? "Quote shortage" : "Inventory restock"}</td>
                  <td className="py-2 pr-3">{c.productType}</td>
                  <td className="py-2 pr-3">{c.grade}</td>
                  <td className="py-2 pr-3">{c.dimension || "-"}</td>
                  <td className="py-2 pr-3">{c.quantity} {c.unit}</td>
                </tr>
              ))}
              {!visibleCandidates.length && (
                <tr>
                  <td className="py-3 px-2 text-steel-600" colSpan={6}>No sourcing candidates right now.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <select className="input" value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)}>
            <option value="">Select manufacturer</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.preferred ? "★ " : ""}{m.name} · {m.specialties.join(", ")}
              </option>
            ))}
          </select>
          <textarea
            className="input md:col-span-2 min-h-16"
            placeholder="Notes to manufacturer (terms, delivery expectations, quality requirements...)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button className="btn" disabled={busy || !selected.length || !manufacturerId} onClick={createRequest}>
          {busy ? "Creating..." : `Create Sourcing Request (${selected.length})`}
        </button>
        {status && <div className="text-xs text-steel-700">{status}</div>}
      </div>

      <div className="panel panel-aurora space-y-2">
        <div className="font-semibold">Sourcing Queue</div>
        {emailingRequestId && (
          <div className="space-y-2 rounded-xl border border-steel-200 bg-steel-50 p-3">
            <div className="section-title">Email Manufacturer</div>
            <input
              className="input"
              placeholder="Recipient email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
            />
            <input
              className="input"
              placeholder="Subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
            <textarea
              className="input min-h-32"
              placeholder="Email message"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button className="btn" disabled={emailBusy || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()} onClick={sendManufacturerEmail}>
                {emailBusy ? "Sending..." : "Send to Manufacturer"}
              </button>
              <button
                className="btn-secondary"
                disabled={emailBusy}
                onClick={() => {
                  setEmailingRequestId(null);
                  setEmailTo("");
                  setEmailSubject("");
                  setEmailBody("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-steel-50">
              <tr className="border-b border-steel-200 text-left">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Manufacturer</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Items</th>
                <th className="py-2 pr-3">Context</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-steel-100">
                  <td className="py-2 pr-3">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-3">{r.manufacturerName}</td>
                  <td className="py-2 pr-3">{r.manufacturerEmail || manufacturers.find((m) => m.id === r.manufacturerId)?.email || "-"}</td>
                  <td className="py-2 pr-3">{r.items.length}</td>
                  <td className="py-2 pr-3">{r.sourceContext === "quote_shortage" ? "Quote shortage" : "Inventory restock"}</td>
                  <td className="py-2 pr-3">
                    <div>{r.status}</div>
                    {r.lastEmailedAt && <div className="text-xs text-steel-600">Emailed {new Date(r.lastEmailedAt).toLocaleString()}</div>}
                  </td>
                  <td className="py-2 pr-3">
                    <button className="btn-secondary" onClick={() => openEmailComposer(r)}>
                      Email Manufacturer
                    </button>
                  </td>
                </tr>
              ))}
              {!requests.length && (
                <tr>
                  <td className="py-3 text-steel-600" colSpan={7}>No sourcing requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
