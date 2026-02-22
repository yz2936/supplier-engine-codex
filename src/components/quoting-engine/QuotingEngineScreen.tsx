"use client";

import { useEffect, useMemo, useState } from "react";
import {
  generateQuote,
  getInventoryMatch,
  getLastQuoteComparison,
  getRiskFlags,
  getRfq,
  listRfqs,
  saveDraft,
  sendQuote
} from "@/adapters/quotingEngineAdapter";
import { money } from "@/lib/format";
import {
  InventoryMatch,
  LastQuoteComparison,
  LineItem,
  QueueFilters,
  QueueStatus,
  RfqCard,
  RfqDetail,
  RiskFlag
} from "@/types/quotingEngine";

type Toast = { id: string; message: string };

const sectionClass = "border-t border-slate-200 pt-5 first:border-t-0 first:pt-0";

const emptyFilters: QueueFilters = { customer: "", dueDate: "", status: "all" };

const priorityBadge = (priority: RfqCard["priority"]) => {
  if (priority === "high") return "bg-rose-50 text-rose-700 border-rose-200";
  if (priority === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
};

const riskChip = (level: RiskFlag["level"]) => {
  if (level === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (level === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const emptyRfqState = (
  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
    <p className="font-medium text-slate-800">No RFQs in this queue.</p>
    <p className="mt-1">Tip: adjust filters or switch tabs to see active requests.</p>
  </div>
);

export function QuotingEngineScreen() {
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>("new");
  const [queueLoading, setQueueLoading] = useState(true);
  const [filters, setFilters] = useState<QueueFilters>(emptyFilters);
  const [rfqs, setRfqs] = useState<RfqCard[]>([]);
  const [selectedRfqId, setSelectedRfqId] = useState<string>("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspace, setWorkspace] = useState<RfqDetail | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string>("");
  const [drawerMatch, setDrawerMatch] = useState<InventoryMatch | null>(null);
  const [drawerRisks, setDrawerRisks] = useState<RiskFlag[]>([]);
  const [lastComparison, setLastComparison] = useState<LastQuoteComparison | null>(null);
  const [reasonForChange, setReasonForChange] = useState("");
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("idle");
  const [savedAt, setSavedAt] = useState<string>("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [search, setSearch] = useState("");
  const [rowSort, setRowSort] = useState<{ key: keyof LineItem; dir: "asc" | "desc" }>({
    key: "lineNumber",
    dir: "asc"
  });

  const addToast = (message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  };

  useEffect(() => {
    (async () => {
      setQueueLoading(true);
      const next = await listRfqs(queueStatus, filters);
      setRfqs(next);
      if (!selectedRfqId && next[0]) setSelectedRfqId(next[0].id);
      if (selectedRfqId && !next.some((rfq) => rfq.id === selectedRfqId)) {
        setSelectedRfqId(next[0]?.id || "");
      }
      setQueueLoading(false);
    })();
  }, [queueStatus, filters, selectedRfqId]);

  useEffect(() => {
    if (!selectedRfqId) {
      setWorkspace(null);
      return;
    }
    (async () => {
      setWorkspaceLoading(true);
      const detail = await getRfq(selectedRfqId);
      setWorkspace(detail);
      setSelectedLineId(detail?.lineItems[0]?.id || "");
      if (detail) {
        const comparison = await getLastQuoteComparison(detail.customerId, detail.lineItems);
        setLastComparison(comparison);
      } else {
        setLastComparison(null);
      }
      setWorkspaceLoading(false);
    })();
  }, [selectedRfqId]);

  const selectedLine = useMemo(
    () => workspace?.lineItems.find((line) => line.id === selectedLineId) || null,
    [selectedLineId, workspace?.lineItems]
  );

  useEffect(() => {
    if (!selectedLine) {
      setDrawerMatch(null);
      setDrawerRisks([]);
      return;
    }
    (async () => {
      const [match, risks] = await Promise.all([getInventoryMatch(selectedLine), getRiskFlags(selectedLine)]);
      setDrawerMatch(match);
      setDrawerRisks(risks);
    })();
  }, [selectedLine]);

  const updateLine = (lineId: string, patch: Partial<LineItem>) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lineItems: prev.lineItems.map((item) => (item.id === lineId ? { ...item, ...patch } : item))
      };
    });
  };

  const sortedLineItems = useMemo(() => {
    if (!workspace) return [];
    const rows = [...workspace.lineItems];
    rows.sort((a, b) => {
      const av = a[rowSort.key];
      const bv = b[rowSort.key];
      if (typeof av === "number" && typeof bv === "number") return rowSort.dir === "asc" ? av - bv : bv - av;
      return rowSort.dir === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });
    return rows;
  }, [rowSort.dir, rowSort.key, workspace]);

  const issuesCount = useMemo(() => {
    if (!workspace) return 0;
    return workspace.lineItems.reduce((acc, row) => {
      const missing = !row.description.trim() || !row.grade.trim() || !row.unit.trim() || row.quantity <= 0;
      return missing ? acc + 1 : acc;
    }, 0);
  }, [workspace]);

  const subtotal = useMemo(() => {
    if (!workspace) return 0;
    return workspace.lineItems.reduce((sum, item) => {
      const unit = item.supplierCost ?? 0;
      return sum + item.quantity * unit;
    }, 0);
  }, [workspace]);

  const total = useMemo(() => {
    if (!workspace) return 0;
    const terms = workspace.pricingTerms;
    const beforeMargin = subtotal + terms.freight + terms.tax;
    const withMargin = beforeMargin * (1 + terms.marginPercent / 100);
    return withMargin * (terms.fx || 1);
  }, [subtotal, workspace]);

  const checklist = useMemo(() => {
    const parseComplete = Boolean(workspace && workspace.lineItems.length > 0);
    const requiredFilled = Boolean(workspace && issuesCount === 0);
    const termsReviewed = Boolean(
      workspace &&
        workspace.pricingTerms.paymentTerms.trim() &&
        workspace.pricingTerms.leadTime.trim() &&
        workspace.pricingTerms.assumptions.trim()
    );
    const readyToSend = parseComplete && requiredFilled && termsReviewed;
    return { parseComplete, requiredFilled, termsReviewed, readyToSend };
  }, [issuesCount, workspace]);

  const filteredRows = useMemo(() => {
    const combined = [search.trim(), globalSearch.trim()].filter(Boolean).join(" ").trim();
    if (!combined) return sortedLineItems;
    const q = combined.toLowerCase();
    return sortedLineItems.filter((line) =>
      [line.description, line.grade, line.size, line.notes, String(line.lineNumber)].join(" ").toLowerCase().includes(q)
    );
  }, [globalSearch, search, sortedLineItems]);

  const visibleRfqs = useMemo(() => {
    if (!globalSearch.trim()) return rfqs;
    const q = globalSearch.toLowerCase();
    return rfqs.filter((rfq) => [rfq.customerName, rfq.id].join(" ").toLowerCase().includes(q));
  }, [globalSearch, rfqs]);

  const handleSaveDraft = async () => {
    if (!workspace) return;
    setSavingState("saving");
    const result = await saveDraft(workspace.id, workspace);
    if (result.ok) {
      setSavingState("saved");
      setSavedAt(result.savedAt);
      addToast("Draft saved.");
      window.setTimeout(() => setSavingState("idle"), 900);
    }
  };

  const updateTerms = (patch: Partial<RfqDetail["pricingTerms"]>) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pricingTerms: { ...prev.pricingTerms, ...patch }
      };
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] items-center gap-3 px-4 py-3">
          <div className="text-lg font-semibold tracking-tight">Quoting Engine</div>
          <div className="max-w-md flex-1">
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="Search RFQ / Customer / Part #"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            {savingState === "saving" ? "Saving..." : "Connected"}
          </div>
          <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">User ▾</button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1700px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          className={`border border-slate-200 bg-white transition-all ${queueCollapsed ? "w-[78px] overflow-hidden" : "w-full"}`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
            {!queueCollapsed && <div className="text-sm font-semibold">Work Queue</div>}
            <button
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              onClick={() => setQueueCollapsed((v) => !v)}
              title={queueCollapsed ? "Expand queue" : "Collapse queue"}
            >
              {queueCollapsed ? "›" : "‹"}
            </button>
          </div>

          <div className="border-b border-slate-200 p-2">
            <div className={`grid ${queueCollapsed ? "grid-cols-1" : "grid-cols-3"} gap-1`}>
              {(["new", "in_progress", "sent"] as QueueStatus[]).map((status) => (
                <button
                  key={status}
                  className={`rounded-md px-2 py-1.5 text-xs ${
                    queueStatus === status ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"
                  }`}
                  onClick={() => setQueueStatus(status)}
                  title={status.replace("_", " ")}
                >
                  {queueCollapsed ? status[0].toUpperCase() : status.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {!queueCollapsed && (
            <div className="space-y-2 border-b border-slate-200 p-3">
              <input
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                placeholder="Filter customer"
                value={filters.customer}
                onChange={(e) => setFilters((prev) => ({ ...prev, customer: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={filters.dueDate}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dueDate: e.target.value }))}
                />
                <select
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={filters.status}
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as QueueFilters["status"] }))}
                >
                  <option value="all">Any status</option>
                  <option value="new">New</option>
                  <option value="in_progress">In Progress</option>
                  <option value="sent">Sent</option>
                </select>
              </div>
            </div>
          )}

          <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-auto p-3">
            {queueLoading && (
              <div className="space-y-2">
                <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
              </div>
            )}
            {!queueLoading && !visibleRfqs.length && !queueCollapsed && emptyRfqState}
            {!queueLoading &&
              visibleRfqs.map((rfq) => (
                <button
                  key={rfq.id}
                  className={`w-full border p-3 text-left text-xs ${
                    selectedRfqId === rfq.id ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  onClick={() => setSelectedRfqId(rfq.id)}
                  title={queueCollapsed ? `${rfq.customerName} ${rfq.id}` : undefined}
                >
                  {queueCollapsed ? (
                    <div className="space-y-1 text-center">
                      <div className="font-semibold">{rfq.id.slice(-3)}</div>
                      <div className="rounded border px-1 py-0.5 text-[10px]">{rfq.itemCount} it</div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-slate-900">{rfq.customerName}</div>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${priorityBadge(rfq.priority)}`}>{rfq.priority}</span>
                      </div>
                      <div className="mt-1 text-slate-600">{rfq.id}</div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                        <div>{new Date(rfq.receivedAt).toLocaleString()}</div>
                        <div>{rfq.itemCount} items</div>
                        <div>Due {rfq.dueDate}</div>
                        <div>{rfq.status.replace("_", " ")}</div>
                      </div>
                    </>
                  )}
                </button>
              ))}
          </div>
        </aside>

        <section className="border border-slate-200 bg-white p-4">
          {workspaceLoading && (
            <div className="space-y-3">
              <div className="h-16 animate-pulse bg-slate-100" />
              <div className="h-72 animate-pulse bg-slate-100" />
            </div>
          )}

          {!workspaceLoading && !workspace && (
            <div className="border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              Select an RFQ from the queue to start quoting.
            </div>
          )}

          {!workspaceLoading && workspace && (
            <>
              <div className="grid gap-3 border-b border-slate-200 pb-4 lg:grid-cols-[1.2fr_1fr]">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Overview</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">Quote Workspace</div>
                  <div className="mt-1 text-sm text-slate-600">Keep edits concise and move line-by-line from summary to pricing.</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { label: "Parse complete", ok: checklist.parseComplete },
                    { label: "Required fields filled", ok: checklist.requiredFilled },
                    { label: "Terms reviewed", ok: checklist.termsReviewed },
                    { label: "Ready to send", ok: checklist.readyToSend }
                  ].map((step) => (
                    <span
                      key={step.label}
                      className={`inline-flex items-center gap-1 border px-2 py-2 ${
                        step.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      {step.ok ? "✓" : "•"} {step.label}
                    </span>
                  ))}
                </div>
              </div>

              <section className={sectionClass}>
                <div className="mb-2 text-sm font-semibold">A. RFQ Summary</div>
                <p className="mb-3 text-xs text-slate-500">Review source context first, then confirm line structure below.</p>
                <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
                  <div><span className="text-slate-500">Customer</span><div className="font-medium">{workspace.customerName}</div></div>
                  <div><span className="text-slate-500">RFQ ID</span><div className="font-medium">{workspace.id}</div></div>
                  <div><span className="text-slate-500">Received</span><div className="font-medium">{new Date(workspace.receivedAt).toLocaleString()}</div></div>
                  <div><span className="text-slate-500">Due</span><div className="font-medium">{workspace.dueDate}</div></div>
                  <div><span className="text-slate-500">Project</span><div className="font-medium">{workspace.projectName || "-"}</div></div>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
                  <div className="p-3 text-xs">
                    <div className="mb-1 font-medium text-slate-700">Source Files</div>
                    <div className="space-y-1">
                      {workspace.sourceFiles.map((f) => (
                        <div key={f.id} className="flex items-center justify-between border-b border-slate-200 px-2 py-1">
                          <span>{f.name}</span>
                          <button className="text-slate-700 underline">View</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 text-xs">
                    <div className="mb-1 font-medium text-slate-700">Key Notes</div>
                    <p className="leading-5 text-slate-700">{workspace.keyNotes || "No key notes available."}</p>
                  </div>
                </div>
              </section>

              <section className={sectionClass}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">B. Line Items</div>
                    <p className="text-xs text-slate-500">Inline edit critical fields quickly. Select a row for detailed controls.</p>
                  </div>
                  <div className={`border px-2 py-1 text-xs ${issuesCount ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                    Issues: {issuesCount}
                  </div>
                </div>

                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <input
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    placeholder="Search line items"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button
                    className="border border-slate-300 bg-white px-2 py-1.5 text-xs"
                    onClick={() => {
                      const nextLine = (workspace.lineItems.at(-1)?.lineNumber || 0) + 1;
                      const next: LineItem = {
                        id: crypto.randomUUID(),
                        lineNumber: nextLine,
                        description: "",
                        grade: "",
                        size: "",
                        quantity: 0,
                        unit: "",
                        requiredDate: workspace.dueDate,
                        notes: "",
                        attachmentsCount: 0
                      };
                      setWorkspace((prev) => (prev ? { ...prev, lineItems: [...prev.lineItems, next] } : prev));
                      setSelectedLineId(next.id);
                    }}
                  >
                    Add row
                  </button>
                  <button
                    className="border border-slate-300 bg-white px-2 py-1.5 text-xs"
                    onClick={() => {
                      if (!selectedLine) return;
                      const duplicate = { ...selectedLine, id: crypto.randomUUID(), lineNumber: workspace.lineItems.length + 1 };
                      setWorkspace((prev) => (prev ? { ...prev, lineItems: [...prev.lineItems, duplicate] } : prev));
                      addToast("Row duplicated.");
                    }}
                  >
                    Duplicate row
                  </button>
                  <button
                    className="border border-slate-300 bg-white px-2 py-1.5 text-xs"
                    onClick={() => {
                      if (!selectedLine) return;
                      setWorkspace((prev) =>
                        prev ? { ...prev, lineItems: prev.lineItems.filter((line) => line.id !== selectedLine.id) } : prev
                      );
                      setSelectedLineId("");
                      addToast("Row deleted.");
                    }}
                  >
                    Delete row
                  </button>
                </div>

                <div className="overflow-x-auto border-y border-slate-200">
                  <table className="min-w-[1120px] w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        {[
                          ["lineNumber", "Line #"],
                          ["description", "Description"],
                          ["grade", "Grade"],
                          ["size", "Size/Dimensions"],
                          ["quantity", "Qty"],
                          ["unit", "Unit"],
                          ["requiredDate", "Required Date"],
                          ["notes", "Notes"],
                          ["attachmentsCount", "Attachments"]
                        ].map(([key, label]) => (
                          <th
                            key={key}
                            className="border-b border-slate-200 px-2 py-2 text-left font-semibold"
                          >
                            <button
                              className="inline-flex items-center gap-1"
                              onClick={() =>
                                setRowSort((prev) => ({
                                  key: key as keyof LineItem,
                                  dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc"
                                }))
                              }
                            >
                              {label}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((line) => {
                        const missing = !line.description.trim() || !line.grade.trim() || !line.unit.trim() || line.quantity <= 0;
                        return (
                          <tr
                            key={line.id}
                            className={`cursor-pointer border-b border-slate-100 ${selectedLineId === line.id ? "bg-slate-50" : "bg-white hover:bg-slate-50/50"}`}
                            onClick={() => setSelectedLineId(line.id)}
                          >
                            <td className="px-2 py-1.5">{line.lineNumber}</td>
                            <td className="px-2 py-1.5">
                              <input
                                className={`w-full rounded border px-2 py-1 ${missing && !line.description.trim() ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}
                                value={line.description}
                                onChange={(e) => updateLine(line.id, { description: e.target.value })}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                className={`w-full rounded border px-2 py-1 ${missing && !line.grade.trim() ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}
                                value={line.grade}
                                onChange={(e) => updateLine(line.id, { grade: e.target.value })}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className="w-full rounded border border-slate-200 px-2 py-1" value={line.size} onChange={(e) => updateLine(line.id, { size: e.target.value })} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                className={`w-full rounded border px-2 py-1 ${missing && line.quantity <= 0 ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}
                                value={line.quantity}
                                onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value || 0) })}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                className={`w-full rounded border px-2 py-1 ${missing && !line.unit.trim() ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}
                                value={line.unit}
                                onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="date" className="w-full rounded border border-slate-200 px-2 py-1" value={line.requiredDate} onChange={(e) => updateLine(line.id, { requiredDate: e.target.value })} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className="w-full rounded border border-slate-200 px-2 py-1" value={line.notes} onChange={(e) => updateLine(line.id, { notes: e.target.value })} />
                            </td>
                            <td className="px-2 py-1.5 text-center">{line.attachmentsCount ? "●" : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={sectionClass}>
                <div className="mb-2 text-sm font-semibold">C. Pricing & Terms</div>
                <p className="mb-3 text-xs text-slate-500">Capture assumptions explicitly to reduce back-and-forth with buyers.</p>
                <div className="mb-3 grid gap-2 md:grid-cols-3 lg:grid-cols-6">
                  <div className="border border-slate-200 p-2 text-xs">
                    <div className="text-slate-500">Subtotal</div>
                    <div className="text-sm font-semibold">{money(subtotal)}</div>
                  </div>
                  <div className="border border-slate-200 p-2 text-xs">
                    <div className="text-slate-500">Freight</div>
                    <div className="text-sm font-semibold">{money(workspace.pricingTerms.freight)}</div>
                  </div>
                  <div className="border border-slate-200 p-2 text-xs">
                    <div className="text-slate-500">Tax</div>
                    <div className="text-sm font-semibold">{money(workspace.pricingTerms.tax)}</div>
                  </div>
                  <div className="border border-slate-200 p-2 text-xs">
                    <div className="text-slate-500">FX</div>
                    <div className="text-sm font-semibold">{workspace.pricingTerms.fx.toFixed(3)}</div>
                  </div>
                  <div className="border border-slate-200 p-2 text-xs">
                    <div className="text-slate-500">Margin</div>
                    <div className="text-sm font-semibold">{workspace.pricingTerms.marginPercent}%</div>
                  </div>
                  <div className="border border-slate-900 bg-slate-900 p-2 text-xs text-white">
                    <div className="text-slate-300">Total</div>
                    <div className="text-sm font-semibold">{money(total)}</div>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <input className="border border-slate-300 px-2 py-2 text-xs" placeholder="Freight" type="number" value={workspace.pricingTerms.freight} onChange={(e) => updateTerms({ freight: Number(e.target.value || 0) })} />
                  <input className="border border-slate-300 px-2 py-2 text-xs" placeholder="Tax" type="number" value={workspace.pricingTerms.tax} onChange={(e) => updateTerms({ tax: Number(e.target.value || 0) })} />
                  <input className="border border-slate-300 px-2 py-2 text-xs" placeholder="Margin %" type="number" value={workspace.pricingTerms.marginPercent} onChange={(e) => updateTerms({ marginPercent: Number(e.target.value || 0) })} />
                  <input className="border border-slate-300 px-2 py-2 text-xs" placeholder="Currency" value={workspace.pricingTerms.currency} onChange={(e) => updateTerms({ currency: e.target.value })} />
                  <input className="border border-slate-300 px-2 py-2 text-xs" placeholder="Payment terms" value={workspace.pricingTerms.paymentTerms} onChange={(e) => updateTerms({ paymentTerms: e.target.value })} />
                  <input className="border border-slate-300 px-2 py-2 text-xs" placeholder="Lead time" value={workspace.pricingTerms.leadTime} onChange={(e) => updateTerms({ leadTime: e.target.value })} />
                  <input className="border border-slate-300 px-2 py-2 text-xs md:col-span-3" placeholder="Incoterms (optional)" value={workspace.pricingTerms.incoterms} onChange={(e) => updateTerms({ incoterms: e.target.value })} />
                  <textarea className="min-h-20 border border-slate-300 px-2 py-2 text-xs md:col-span-3" placeholder="Assumptions (recommended)" value={workspace.pricingTerms.assumptions} onChange={(e) => updateTerms({ assumptions: e.target.value })} />
                </div>

                <div className="mt-3 border-t border-slate-200 pt-3 text-xs">
                  <div className="mb-1 font-medium text-slate-700">Price Compared to Last Quote</div>
                  {lastComparison ? (
                    <div className="grid gap-2 md:grid-cols-3">
                      <div>Last price: <span className="font-semibold">{money(lastComparison.lastPrice)}</span></div>
                      <div>
                        Delta:{" "}
                        <span className={`font-semibold ${lastComparison.deltaPercent >= 0 ? "text-amber-700" : "text-emerald-700"}`}>
                          {lastComparison.deltaPercent >= 0 ? "+" : ""}{lastComparison.deltaPercent.toFixed(1)}%
                        </span>
                      </div>
                      <input
                        className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
                        placeholder="Reason for change (optional)"
                        value={reasonForChange}
                        onChange={(e) => setReasonForChange(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="text-slate-600">No previous quote found.</div>
                  )}
                </div>
              </section>
            </>
          )}
        </section>

        {!workspaceLoading && workspace && selectedLine && (
          <aside className="fixed inset-y-0 right-0 z-30 w-full border-l border-slate-200 bg-white p-4 shadow-xl lg:static lg:h-fit lg:w-[360px] lg:border">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">D. Line Item Drawer</div>
              <button className="border border-slate-300 px-2 py-1 text-xs lg:hidden" onClick={() => setSelectedLineId("")}>Close</button>
            </div>
            <p className="mb-3 text-xs text-slate-500">Adjust detailed values here; keep table edits quick and minimal.</p>

            <div className="space-y-2 text-xs">
              <label className="block">
                Description
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={selectedLine.description} onChange={(e) => updateLine(selectedLine.id, { description: e.target.value })} />
              </label>
              <label className="block">
                Grade
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={selectedLine.grade} onChange={(e) => updateLine(selectedLine.id, { grade: e.target.value })} />
              </label>
              <label className="block">
                Size/Dimensions
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={selectedLine.size} onChange={(e) => updateLine(selectedLine.id, { size: e.target.value })} />
              </label>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3 text-xs">
              <div className="mb-1 font-medium text-slate-700">Inventory Match (read-only)</div>
              {!drawerMatch ? (
                <div className="text-slate-500">Loading inventory match...</div>
              ) : (
                <div className="space-y-1 text-slate-700">
                  <div>Matched SKU: <span className="font-medium">{drawerMatch.matchedSku}</span></div>
                  <div>On-hand: <span className="font-medium">{drawerMatch.onHand}</span></div>
                  <div>ETA: <span className="font-medium">{drawerMatch.eta}</span></div>
                  <div>Confidence: <span className="font-medium">{Math.round(drawerMatch.confidence * 100)}%</span></div>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="font-medium text-slate-700">Supplier Cost Inputs</div>
              <input className="w-full rounded border border-slate-300 px-2 py-1.5" type="number" placeholder="Cost" value={selectedLine.supplierCost ?? ""} onChange={(e) => updateLine(selectedLine.id, { supplierCost: Number(e.target.value || 0) })} />
              <input className="w-full rounded border border-slate-300 px-2 py-1.5" type="number" placeholder="MOQ" value={selectedLine.moq ?? ""} onChange={(e) => updateLine(selectedLine.id, { moq: Number(e.target.value || 0) })} />
              <input className="w-full rounded border border-slate-300 px-2 py-1.5" placeholder="Mill" value={selectedLine.mill ?? ""} onChange={(e) => updateLine(selectedLine.id, { mill: e.target.value })} />
              <input className="w-full rounded border border-slate-300 px-2 py-1.5" placeholder="Coating / Finish" value={selectedLine.finish ?? ""} onChange={(e) => updateLine(selectedLine.id, { finish: e.target.value })} />
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3 text-xs">
              <div className="mb-1 font-medium text-slate-700">Risk Flags (read-only)</div>
              <div className="flex flex-wrap gap-1.5">
                {drawerRisks.map((risk) => (
                <span key={`${risk.type}-${risk.label}`} className={`border px-2 py-0.5 ${riskChip(risk.level)}`}>
                    {risk.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                onClick={() => {
                  if (!drawerMatch) return;
                  updateLine(selectedLine.id, {
                    matchedSku: drawerMatch.matchedSku,
                    onHand: drawerMatch.onHand,
                    eta: drawerMatch.eta,
                    confidence: drawerMatch.confidence
                  });
                  addToast("Suggested values applied.");
                }}
              >
                Apply suggested values
              </button>
              <button className="border border-slate-300 bg-white px-2.5 py-1.5 text-xs" onClick={() => addToast("Marked as needs clarification.")}>
                Mark as needs clarification
              </button>
            </div>
          </aside>
        )}

        {!workspaceLoading && workspace && !selectedLine && (
          <aside className="hidden border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-600 lg:block">
            <div className="mb-1 text-sm font-semibold text-slate-800">Line Item Drawer</div>
            <p>Select a line item to view inventory match, risks, and advanced cost fields.</p>
          </aside>
        )}
      </main>

      <div className="sticky bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-2 px-4 py-3">
          <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" onClick={handleSaveDraft}>Save Draft</button>
          <button
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            onClick={async () => {
              if (!workspace) return;
              const result = await generateQuote(workspace.id);
              addToast(result.message);
            }}
          >
            Generate Quote PDF
          </button>
          <button
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            onClick={async () => {
              if (!workspace) return;
              const result = await sendQuote(workspace.id);
              addToast(result.message);
            }}
          >
            Send to Customer
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">Export Excel</button>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">Add Internal Comment</button>
          <div className="ml-auto text-xs text-slate-600">
            {savedAt ? `Draft saved at ${new Date(savedAt).toLocaleTimeString()}` : "Draft not saved yet"}
          </div>
        </div>
      </div>

      <div className="fixed right-4 top-16 z-50 space-y-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
