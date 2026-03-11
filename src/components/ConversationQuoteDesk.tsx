"use client";

import { useEffect, useMemo, useState } from "react";
import { money, stockColor, stockLabel, summarizeRequestedSpecs } from "@/lib/format";
import { QuoteAgentSession, QuoteApprovalRequest } from "@/lib/types";

const stageLabels = [
  { key: "email_selected", label: "Email" },
  { key: "rfq_parsed", label: "Parse" },
  { key: "inventory_checked", label: "Compare" },
  { key: "draft_ready", label: "Draft" },
  { key: "awaiting_approval", label: "Approve" },
  { key: "sent", label: "Sent" }
] as const;

const statusTone: Record<string, string> = {
  active: "status-chip-steel",
  saved: "status-chip-teal",
  awaiting_approval: "status-chip-amber",
  completed: "status-chip-teal",
  rejected: "status-chip-steel",
  discarded: "status-chip-steel",
  error: "status-chip-amber"
};

const formatTime = (value?: string) => value ? new Date(value).toLocaleString() : "Not yet";

export function ConversationQuoteDesk() {
  const [sessions, setSessions] = useState<QuoteAgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [isNewWorkflow, setIsNewWorkflow] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approvalModal, setApprovalModal] = useState<QuoteApprovalRequest | null>(null);
  const [pendingMargin, setPendingMargin] = useState(12);

  const activeSession = useMemo(() => {
    if (isNewWorkflow) return null;
    if (activeSessionId) return sessions.find((session) => session.id === activeSessionId) || null;
    return sessions[0] || null;
  }, [activeSessionId, isNewWorkflow, sessions]);

  const emailCard = useMemo(
    () => activeSession?.cards.find((card) => card.type === "email_preview") || null,
    [activeSession]
  );

  const extractionCard = useMemo(
    () => activeSession?.cards.find((card) => card.type === "rfq_extraction") || null,
    [activeSession]
  );

  const inventoryCard = useMemo(
    () => activeSession?.cards.find((card) => card.type === "inventory_match") || null,
    [activeSession]
  );

  const quoteCard = useMemo(
    () => activeSession?.cards.find((card) => card.type === "quote_preview") || null,
    [activeSession]
  );

  const riskCards = useMemo(
    () => activeSession?.cards.filter((card) => card.type === "risk_alert") || [],
    [activeSession]
  );

  const latestAssistantMessage = useMemo(
    () => [...(activeSession?.messages || [])].reverse().find((message) => message.role === "assistant") || null,
    [activeSession]
  );

  const inventoryMatches = useMemo(
    () => inventoryCard?.type === "inventory_match" ? inventoryCard.matches : [],
    [inventoryCard]
  );

  const workspaceRows = useMemo(() => {
    const extracted = extractionCard?.type === "rfq_extraction" ? extractionCard.lineItems : [];
    const quoteLines = quoteCard?.type === "quote_preview" ? quoteCard.lines : [];
    const count = Math.max(extracted.length, inventoryMatches.length, quoteLines.length);
    return Array.from({ length: count }, (_, index) => {
      const extractedLine = extracted[index];
      const match = inventoryMatches[index];
      const quoteLine = quoteLines[index];
      return {
        id: `${index}-${extractedLine?.rawSpec || quoteLine?.description || match?.inventoryItem?.sku || "line"}`,
        requestedLabel: extractedLine
          ? [extractedLine.grade, extractedLine.category].filter(Boolean).join(" ")
          : quoteLine?.description || "Unparsed item",
        requestedSpecs: extractedLine
          ? summarizeRequestedSpecs(extractedLine).join(" | ") || extractedLine.rawSpec
          : "Awaiting parse",
        quantity: extractedLine
          ? `${extractedLine.quantity} ${extractedLine.quantityUnit}`
          : quoteLine
            ? `${quoteLine.quantity} ${quoteLine.unit}`
            : "-",
        score: typeof match?.score === "number" ? `${Math.round(match.score * 100)}%` : "Pending",
        unitPrice: typeof quoteLine?.unitPrice === "number" ? money(quoteLine.unitPrice) : "Pending",
        extendedPrice: typeof quoteLine?.extendedPrice === "number" ? money(quoteLine.extendedPrice) : "Pending",
        match
      };
    });
  }, [extractionCard, inventoryMatches, quoteCard]);

  const capabilitySummary = useMemo(() => {
    const green = inventoryMatches.filter((match) => match.stockStatus === "green").length;
    const yellow = inventoryMatches.filter((match) => match.stockStatus === "yellow").length;
    const red = inventoryMatches.filter((match) => match.stockStatus === "red").length;
    return { green, yellow, red };
  }, [inventoryMatches]);

  useEffect(() => {
    setPendingMargin(activeSession?.marginPercent ?? 12);
  }, [activeSession?.id, activeSession?.marginPercent]);

  const upsertSession = (next: QuoteAgentSession) => {
    setSessions((prev) => {
      const existing = prev.find((session) => session.id === next.id);
      if (!existing) return [next, ...prev];
      return prev.map((session) => session.id === next.id ? next : session);
    });
    setIsNewWorkflow(false);
    setActiveSessionId(next.id);
    setApprovalModal(next.approval?.status === "pending" ? next.approval : null);
  };

  const loadSessions = async () => {
    const res = await fetch("/api/agent/quote", { credentials: "include", cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load quote sessions");
    setSessions(json.sessions || []);
    if (json.sessions?.[0]?.id) {
      setActiveSessionId((current: string) => current || json.sessions[0].id);
      setIsNewWorkflow(false);
    }
  };

  useEffect(() => {
    void loadSessions().catch((err) => setError(err instanceof Error ? err.message : "Failed to load quote sessions"));
  }, []);

  const sendCommand = async (command: string) => {
    const text = command.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/agent/quote", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: isNewWorkflow ? "" : activeSession?.id, command: text })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Quote agent failed");
      upsertSession(json.session);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote agent failed");
    } finally {
      setBusy(false);
    }
  };

  const runSessionAction = async (action: "save" | "update_margin", body?: Record<string, unknown>) => {
    if (!activeSession) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/agent/quote/${activeSession.id}`, {
        credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Quote session update failed");
      upsertSession(json.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote session update failed");
    } finally {
      setBusy(false);
    }
  };

  const discardWorkflow = async () => {
    if (!activeSession) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/agent/quote/${activeSession.id}`, {
        credentials: "include",
        method: "DELETE"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Discard failed");
      setSessions((prev) => {
        const nextSessions = prev.map((session) => session.id === json.session.id ? json.session : session);
        const nextActive = nextSessions.find((session) => session.id !== activeSession.id && session.status !== "discarded");
        setActiveSessionId(nextActive?.id || "");
        setIsNewWorkflow(!nextActive);
        return nextSessions;
      });
      setApprovalModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discard failed");
    } finally {
      setBusy(false);
    }
  };

  const approveSend = async () => {
    if (!activeSession) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/agent/quote/${activeSession.id}/approve`, {
        credentials: "include",
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Approval failed");
      upsertSession(json.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  };

  const visibleSessions = sessions.filter((session) => session.status !== "discarded");
  const approvalPending = activeSession?.approval?.status === "pending";
  const draftReady = activeSession?.stage === "draft_ready" || activeSession?.stage === "awaiting_approval" || activeSession?.stage === "sent";
  const parseReady = Boolean(extractionCard?.type === "rfq_extraction");

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="panel-industrial flex min-h-[760px] flex-col gap-4 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="section-title">Quote Desk</div>
              <h3 className="font-['Sora'] text-3xl font-semibold tracking-[-0.04em] text-steel-950">Parse, review, approve</h3>
              <p className="mt-2 max-w-2xl text-sm text-steel-600">
                Pull the latest buyer email, extract specs, compare with inventory and capability, then approve and send to suppliers.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setIsNewWorkflow(true);
                  setActiveSessionId("");
                  setInput("");
                  setError("");
                  setApprovalModal(null);
                }}
              >
                New Workflow
              </button>
              <button className="btn-secondary" disabled={busy} onClick={() => void sendCommand("Quote the latest email from the buyer.")}>
                {busy ? "Parsing..." : "Parse Email"}
              </button>
              <button className="btn-secondary" disabled={!activeSession || busy} onClick={() => void runSessionAction("save")}>Save Draft</button>
              <button className="btn" disabled={!approvalPending || busy} onClick={() => setApprovalModal(activeSession?.approval || null)}>
                {approvalPending ? "Approve & Send" : "Awaiting Approval"}
              </button>
              <button className="btn-ghost" disabled={!activeSession || busy} onClick={() => void discardWorkflow()}>Discard</button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[24px] border border-steel-200 bg-white/72 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="section-title">Workspace</div>
                  <div className="mt-1 text-lg font-semibold text-steel-950">{activeSession?.title || "No active quote yet"}</div>
                  <div className="mt-1 text-sm text-steel-600">
                    {activeSession
                      ? `${activeSession.buyerEmail || "Buyer not linked"} · last updated ${formatTime(activeSession.updatedAt)}`
                      : "Load the latest buyer email to start a review."}
                  </div>
                </div>
                {activeSession && <span className={`status-chip ${statusTone[activeSession.status] || "status-chip-steel"}`}>{activeSession.status.replace(/_/g, " ")}</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {stageLabels.map((stage) => {
                  const isActive = activeSession?.stage === stage.key;
                  const currentIndex = stageLabels.findIndex((item) => item.key === activeSession?.stage);
                  const stageIndex = stageLabels.findIndex((item) => item.key === stage.key);
                  const isCompleted = currentIndex >= stageIndex && currentIndex !== -1;
                  return (
                    <div
                      key={stage.key}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        isActive
                          ? "border-orange-300 bg-orange-50 text-orange-800"
                          : isCompleted
                            ? "border-teal-200 bg-teal-50 text-teal-800"
                            : "border-steel-200 bg-white text-steel-500"
                      }`}
                    >
                      {stage.label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-steel-200 bg-white/72 p-4">
              <div className="section-title">Controls</div>
              <div className="mt-3 space-y-3">
                <button className="btn w-full" disabled={busy} onClick={() => void sendCommand("Quote the latest email from the buyer.")}>
                  {busy ? "Working..." : "Parse latest buyer email"}
                </button>
                <button className="btn-secondary w-full" disabled={!activeSession || busy} onClick={() => void sendCommand("Don't include the out-of-stock items.")}>
                  Remove out-of-stock lines
                </button>
                <button className="btn-secondary w-full" disabled={!activeSession || busy} onClick={() => void runSessionAction("update_margin", { marginPercent: pendingMargin })}>
                  Apply {pendingMargin}% margin
                </button>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={pendingMargin}
                  className="w-full"
                  disabled={!activeSession || busy}
                  onChange={(e) => setPendingMargin(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-[26px] border border-steel-200 bg-[#f7fafc] p-4">
            {!activeSession && (
              <div className="mx-auto max-w-3xl space-y-3">
                <div className="rounded-[24px] border border-dashed border-steel-300 bg-white px-5 py-10 text-center">
                  <div className="text-sm font-medium text-steel-900">Start a quote workflow</div>
                  <div className="mt-2 text-sm text-steel-600">Use “Parse Email” to pull the latest buyer request and populate the review workspace.</div>
                </div>
              </div>
            )}

            {activeSession && (
              <div className="mx-auto max-w-[1400px] space-y-4">
                <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <section className="rounded-[24px] border border-steel-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="section-title">Buyer request</div>
                        <div className="mt-1 text-lg font-semibold text-steel-950">
                          {emailCard?.type === "email_preview" ? emailCard.email.subject || "(No subject)" : "Waiting for buyer email"}
                        </div>
                      </div>
                      {emailCard?.type === "email_preview" && (
                        <span className="rounded-full border border-steel-200 bg-steel-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-600">
                          Email
                        </span>
                      )}
                    </div>
                    <div className="mt-3 space-y-3 text-sm text-steel-700">
                      <div className="rounded-2xl border border-steel-200 bg-steel-50/80 px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">From</div>
                        <div className="mt-1 font-medium text-steel-900">
                          {emailCard?.type === "email_preview" ? emailCard.email.fromEmail : activeSession.buyerEmail || "No buyer linked"}
                        </div>
                        <div className="mt-1 text-xs text-steel-500">
                          {emailCard?.type === "email_preview" ? formatTime(emailCard.email.receivedAt) : "No inbound message yet"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-steel-200 bg-white px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Request body</div>
                        <div className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap text-sm leading-6 text-steel-700">
                          {emailCard?.type === "email_preview"
                            ? emailCard.email.bodyText
                            : activeSession.rfqText || "Parse the latest buyer email to load the request."}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-steel-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="section-title">Line items</div>
                        <div className="mt-1 text-lg font-semibold text-steel-950">
                          {workspaceRows.length ? `${workspaceRows.length} items in workspace` : "No line items yet"}
                        </div>
                        <div className="mt-1 text-sm text-steel-600">
                          Review specs, compare inventory and capability, then approve the supplier send.
                        </div>
                      </div>
                      {quoteCard?.type === "quote_preview" && (
                        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-right">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-700">Quote total</div>
                          <div className="mt-1 text-lg font-semibold text-orange-800">{money(quoteCard.total)}</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-[22px] border border-steel-200 bg-steel-50/70 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">In stock</div>
                        <div className="mt-2 text-2xl font-semibold text-steel-950">{capabilitySummary.green}</div>
                      </div>
                      <div className="rounded-[22px] border border-steel-200 bg-steel-50/70 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Partial / review</div>
                        <div className="mt-2 text-2xl font-semibold text-steel-950">{capabilitySummary.yellow}</div>
                      </div>
                      <div className="rounded-[22px] border border-steel-200 bg-steel-50/70 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Out of stock</div>
                        <div className="mt-2 text-2xl font-semibold text-steel-950">{capabilitySummary.red}</div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      {workspaceRows.length ? workspaceRows.map((row) => (
                        <div key={row.id} className="rounded-[22px] border border-steel-200 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 bg-[#f3f7ff] px-4 py-4">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="mt-1 h-5 w-5 rounded-md border border-blue-200 bg-white" />
                              <div className="min-w-0">
                                <div className="text-lg font-semibold text-steel-950">{row.requestedLabel}</div>
                                <div className="mt-1 text-sm text-steel-600">{row.quantity}</div>
                                <div className="mt-1 text-xs leading-5 text-steel-500">{row.requestedSpecs}</div>
                              </div>
                            </div>
                            <button className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                              Supplier review
                            </button>
                          </div>

                          <div className="px-4 py-4">
                            <div className="mb-3 text-sm font-medium text-steel-600">
                              Inventory & capability {row.match?.alternatives?.length ? `(${row.match.alternatives.length + (row.match.inventoryItem ? 1 : 0)} options)` : ""}
                            </div>
                            <div className="space-y-3">
                              {row.match?.inventoryItem ? (
                                <div className="rounded-2xl border border-steel-200 bg-white px-4 py-4">
                                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_110px_90px_110px_110px] lg:items-start">
                                    <div>
                                      <div className="font-medium text-steel-900">{row.match.inventoryItem.specText || row.match.inventoryItem.sku}</div>
                                      <div className="mt-1 text-sm text-steel-500">SKU: {row.match.inventoryItem.sku}</div>
                                    </div>
                                    <div>
                                      <div className="text-sm text-steel-500">Avail</div>
                                      <div className="mt-1 flex items-center gap-2 text-base font-semibold text-steel-900">
                                        <span className={`h-2.5 w-2.5 rounded-full ${stockColor(row.match.stockStatus)}`} />
                                        {stockLabel(row.match.stockStatus)}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-sm text-steel-500">Score</div>
                                      <div className="mt-1 text-base font-semibold text-steel-900">{row.score}</div>
                                    </div>
                                    <div>
                                      <div className="text-sm text-steel-500">Unit Price</div>
                                      <div className="mt-1 text-base font-semibold text-steel-900">{row.unitPrice}</div>
                                    </div>
                                    <div>
                                      <div className="text-sm text-steel-500">Total</div>
                                      <div className="mt-1 text-base font-semibold text-steel-900">{row.extendedPrice}</div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-2xl border border-dashed border-steel-300 bg-steel-50/70 px-4 py-4 text-sm text-steel-600">
                                  No direct inventory match yet. Review capability or route this line to sourcing.
                                </div>
                              )}

                              {row.match?.alternatives?.slice(0, 2).map((alternative) => (
                                <div key={alternative.sku} className="rounded-2xl border border-steel-200 bg-steel-50/50 px-4 py-4">
                                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_110px_110px] lg:items-start">
                                    <div>
                                      <div className="font-medium text-steel-900">{alternative.specText || alternative.sku}</div>
                                      <div className="mt-1 text-sm text-steel-500">SKU: {alternative.sku}</div>
                                    </div>
                                    <div>
                                      <div className="text-sm text-steel-500">On Hand</div>
                                      <div className="mt-1 text-base font-semibold text-steel-900">{alternative.qtyOnHand}</div>
                                    </div>
                                    <div>
                                      <div className="text-sm text-steel-500">Base Price</div>
                                      <div className="mt-1 text-base font-semibold text-steel-900">{money(alternative.basePrice)}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-[22px] border border-dashed border-steel-300 bg-white px-4 py-10 text-center text-sm text-steel-500">
                          The workspace will fill after the agent parses a buyer RFQ.
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="rounded-[22px] border border-steel-200 bg-steel-50/70 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Latest note</div>
                        <div className="mt-2 text-sm leading-6 text-steel-800">
                          {latestAssistantMessage?.content || "The agent will summarize the latest parsing and comparison result here."}
                        </div>
                      </div>
                      <div className="rounded-[22px] border border-steel-200 bg-white p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Supplier draft</div>
                        <div className="mt-2 text-sm font-medium text-steel-900">
                          {quoteCard?.type === "quote_preview" ? quoteCard.draftSubject : "No supplier draft yet"}
                        </div>
                        <div className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5 text-steel-600">
                          {quoteCard?.type === "quote_preview"
                            ? quoteCard.draftBody
                            : "When the draft is ready, the outbound supplier message will appear here."}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[24px] border border-steel-200 bg-white/86 p-4">
              <div className="section-title">Operator command</div>
              <div className="mt-2 flex flex-col gap-3">
                <textarea
                  className="input min-h-24"
                  placeholder="Optional: revise tone, change lead time, exclude lines, or leave an instruction for the agent."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button className="btn" disabled={busy || !input.trim()} onClick={() => void sendCommand(input)}>{busy ? "Working..." : "Apply instruction"}</button>
                  {approvalPending && (
                    <button className="btn-secondary" disabled={busy} onClick={() => setApprovalModal(activeSession?.approval || null)}>
                      Review approval
                    </button>
                  )}
                </div>
              </div>
              {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
            </div>

            <div className="rounded-[24px] border border-steel-200 bg-white/86 p-4">
              <div className="section-title">Review status</div>
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl border border-steel-200 bg-steel-50/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Parsed</div>
                  <div className="mt-1 font-semibold text-steel-900">{parseReady ? "Yes" : "No"}</div>
                </div>
                <div className="rounded-2xl border border-steel-200 bg-steel-50/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Draft ready</div>
                  <div className="mt-1 font-semibold text-steel-900">{draftReady ? "Yes" : "No"}</div>
                </div>
                <div className="rounded-2xl border border-steel-200 bg-steel-50/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Approval</div>
                  <div className="mt-1 font-semibold text-steel-900">{activeSession?.approval?.status || "n/a"}</div>
                </div>
                <div className="rounded-2xl border border-steel-200 bg-steel-50/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Saved</div>
                  <div className="mt-1 font-semibold text-steel-900">{activeSession?.savedAt ? "Yes" : "No"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="landing-card">
            <div className="section-title">Quote workflows</div>
            <div className="mt-3 space-y-2">
              {visibleSessions.length ? visibleSessions.map((session) => (
                <button
                  key={session.id}
                  className={activeSession?.id === session.id
                    ? "w-full rounded-2xl border border-orange-300 bg-orange-50/70 px-3 py-3 text-left"
                    : "w-full rounded-2xl border border-steel-200 bg-white/75 px-3 py-3 text-left"}
                  onClick={() => {
                    setIsNewWorkflow(false);
                    setActiveSessionId(session.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-steel-900">{session.title}</div>
                      <div className="mt-1 text-xs text-steel-600">{session.customerName || session.buyerEmail || "Unsaved workflow"}</div>
                    </div>
                    <span className={`status-chip ${statusTone[session.status] || "status-chip-steel"}`}>{session.status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-2 text-xs text-steel-500">{formatTime(session.updatedAt)}</div>
                </button>
              )) : <div className="text-sm text-steel-600">No quote workflows yet.</div>}
            </div>
          </div>

          <div className="landing-card">
            <div className="section-title">Exceptions</div>
            <div className="mt-3 space-y-2">
              {riskCards.length ? riskCards.map((card) => (
                <div
                  key={card.id}
                  className={`rounded-2xl border px-3 py-3 ${
                    card.severity === "critical" ? "border-rose-200 bg-rose-50/70" : "border-amber-200 bg-amber-50/70"
                  }`}
                >
                  <div className="text-sm font-semibold text-steel-900">{card.title}</div>
                  <div className="mt-2 space-y-1 text-xs leading-5 text-steel-700">
                    {card.items.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
              )) : <div className="text-sm text-steel-600">No open exceptions.</div>}
            </div>
          </div>
        </div>
      </div>

      {approvalModal && activeSession?.approval?.status === "pending" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-steel-950/40 px-4">
          <div className="w-full max-w-xl rounded-[28px] border border-steel-200 bg-white p-6 shadow-2xl">
            <div className="section-title">Approval gate</div>
            <div className="mt-2 text-2xl font-semibold text-steel-950">{approvalModal.title}</div>
            <div className="mt-2 text-sm text-steel-600">{approvalModal.detail}</div>
            <div className="mt-4 rounded-2xl border border-steel-200 bg-steel-50/80 p-4 text-sm text-steel-700">
              No outbound supplier email will be sent until you approve this action.
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="btn" disabled={busy} onClick={() => void approveSend()}>{busy ? "Sending..." : "Approve And Send"}</button>
              <button className="btn-secondary" disabled={busy} onClick={() => setApprovalModal(null)}>Close</button>
              <button className="btn-ghost" disabled={busy} onClick={() => void sendCommand("Reject this send and keep the draft open.")}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
