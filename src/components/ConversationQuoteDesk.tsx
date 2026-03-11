"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { money, stockColor, stockLabel, summarizeRequestedSpecs } from "@/lib/format";
import {
  QuoteAgentSession,
  QuoteApprovalRequest,
  QuoteUiCard
} from "@/lib/types";

const starterPrompts = [
  "Quote the latest email from the buyer.",
  "Don't include the out-of-stock items.",
  "Change the lead time to 8 weeks.",
  "Draft a more concise email."
];

const stageLabels = [
  { key: "email_selected", label: "Email" },
  { key: "rfq_parsed", label: "Parse" },
  { key: "inventory_checked", label: "Inventory" },
  { key: "draft_ready", label: "Draft" },
  { key: "awaiting_approval", label: "Approval" },
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
  const endRef = useRef<HTMLDivElement | null>(null);

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

  const approvalCard = useMemo(
    () => activeSession?.cards.find((card) => card.type === "approval") || null,
    [activeSession]
  );

  const workspaceRows = useMemo(() => {
    const extracted = extractionCard?.type === "rfq_extraction" ? extractionCard.lineItems : [];
    const matches = inventoryCard?.type === "inventory_match" ? inventoryCard.matches : [];
    const quoteLines = quoteCard?.type === "quote_preview" ? quoteCard.lines : [];
    const count = Math.max(extracted.length, matches.length, quoteLines.length);
    return Array.from({ length: count }, (_, index) => {
      const extractedLine = extracted[index];
      const match = matches[index];
      const quoteLine = quoteLines[index];
      return {
        id: `${index}-${extractedLine?.rawSpec || quoteLine?.description || match?.inventoryItem?.sku || "line"}`,
        requestedLabel: extractedLine
          ? [extractedLine.grade, extractedLine.category].filter(Boolean).join(" ")
          : quoteLine?.description || "Unparsed item",
        requestedSpecs: extractedLine ? summarizeRequestedSpecs(extractedLine).join(" | ") || extractedLine.rawSpec : "Awaiting parse",
        quantity: extractedLine ? `${extractedLine.quantity} ${extractedLine.quantityUnit}` : quoteLine ? `${quoteLine.quantity} ${quoteLine.unit}` : "-",
        stockStatus: match?.stockStatus || quoteLine?.stockStatus,
        matchedSku: match?.inventoryItem?.sku || quoteLine?.sku || "No match yet",
        score: typeof match?.score === "number" ? `${Math.round(match.score * 100)}%` : "Pending",
        unitPrice: typeof quoteLine?.unitPrice === "number" ? money(quoteLine.unitPrice) : "Pending",
        extendedPrice: typeof quoteLine?.extendedPrice === "number" ? money(quoteLine.extendedPrice) : "Pending"
      };
    });
  }, [extractionCard, inventoryCard, quoteCard]);

  const latestAssistantMessage = useMemo(
    () => [...(activeSession?.messages || [])].reverse().find((message) => message.role === "assistant") || null,
    [activeSession]
  );

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
    if (next.approval?.status === "pending") setApprovalModal(next.approval);
    else setApprovalModal(null);
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeSession?.messages, activeSession?.cards]);

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

  const renderCard = (card: QuoteUiCard) => {
    if (card.type === "email_preview") {
      return (
        <details key={card.id} className="rounded-[22px] border border-steel-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]" open>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
            <div>
              <div className="section-title">Step 1 · Buyer Email</div>
              <div className="mt-1 text-base font-semibold text-steel-950">{card.email.subject || "(No subject)"}</div>
              <div className="mt-1 text-xs text-steel-600">{card.email.fromEmail} · {formatTime(card.email.receivedAt)}</div>
            </div>
            <span className="rounded-full border border-steel-200 bg-steel-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-600">
              Expand
            </span>
          </summary>
          <div className="mt-3 max-h-40 overflow-auto rounded-2xl border border-steel-200 bg-steel-50/80 p-3 text-sm leading-6 text-steel-700 whitespace-pre-wrap">
            {card.email.bodyText}
          </div>
        </details>
      );
    }

    if (card.type === "rfq_extraction") {
      return (
        <details key={card.id} className="rounded-[22px] border border-steel-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]" open>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
            <div>
              <div className="section-title">Step 2 · Parsed RFQ</div>
              <div className="mt-1 text-sm text-steel-600">{card.summary}</div>
            </div>
            <div className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">
              {card.lineItems.length} lines
            </div>
          </summary>
          <div className="mt-3 overflow-hidden rounded-2xl border border-steel-200">
            <table className="data-grid border-0">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Specs</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {card.lineItems.map((item, index) => (
                  <tr key={`${item.rawSpec}-${index}`}>
                    <td className="py-3 pr-3 text-sm font-medium text-steel-900">{[item.grade, item.category].filter(Boolean).join(" ")}</td>
                    <td className="py-3 pr-3 text-xs text-steel-600">{summarizeRequestedSpecs(item).join(" | ") || item.rawSpec}</td>
                    <td className="py-3 pr-3 text-sm text-steel-800">{item.quantity} {item.quantityUnit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      );
    }

    if (card.type === "inventory_match") {
      return (
        <details key={card.id} className="rounded-[22px] border border-steel-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
            <div>
              <div className="section-title">Step 3 · Inventory Check</div>
              <div className="mt-1 text-sm text-steel-600">Each requested line is matched against current inventory before pricing is proposed.</div>
            </div>
            <span className="rounded-full border border-steel-200 bg-steel-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-600">
              Review
            </span>
          </summary>
          <div className="mt-3 overflow-hidden rounded-2xl border border-steel-200">
            <table className="data-grid border-0">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Matched SKU</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {card.matches.map((match, index) => (
                  <tr key={`${match.requested.rawSpec}-${index}`}>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${stockColor(match.stockStatus)}`} />
                        <span className="text-xs text-steel-700">{stockLabel(match.stockStatus)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-sm text-steel-800">{[match.requested.grade, match.requested.category].filter(Boolean).join(" ")}</td>
                    <td className="py-3 pr-3 text-sm text-steel-700">{match.inventoryItem?.sku || "No match"}</td>
                    <td className="py-3 pr-3 text-sm text-steel-700">{match.score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      );
    }

    if (card.type === "quote_preview") {
      return (
        <details key={card.id} className="rounded-[22px] border border-steel-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]" open>
          <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
            <div>
              <div className="section-title">Step 4 · Quote Draft</div>
              <div className="mt-1 text-base font-semibold text-steel-950">{card.customerName}</div>
              <div className="text-sm text-steel-600">{card.buyerEmail}</div>
            </div>
            <div className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-700">
              Total {money(card.total)}
            </div>
          </summary>
          <div className="mt-3 overflow-hidden rounded-2xl border border-steel-200">
            <table className="data-grid border-0">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Unit Price</th>
                  <th>Extended</th>
                </tr>
              </thead>
              <tbody>
                {card.lines.map((line, index) => (
                  <tr key={`${line.description}-${index}`}>
                    <td className="py-3 pr-3 text-sm text-steel-800">{line.description}</td>
                    <td className="py-3 pr-3 text-sm text-steel-800">{line.quantity}</td>
                    <td className="py-3 pr-3 text-sm text-steel-800">{line.unit}</td>
                    <td className="py-3 pr-3 text-sm text-steel-800">{money(line.unitPrice)}</td>
                    <td className="py-3 pr-3 text-sm font-medium text-orange-700">{money(line.extendedPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="mt-3 rounded-2xl border border-steel-200 bg-steel-50/80 p-3">
            <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">
              Outbound Draft Email
            </summary>
            <div className="mt-1 text-sm font-medium text-steel-900">{card.draftSubject}</div>
            <div className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-5 text-steel-700">{card.draftBody}</div>
          </details>
        </details>
      );
    }

    if (card.type === "risk_alert") {
      return (
        <div key={card.id} className={`rounded-[22px] border p-4 ${card.severity === "critical" ? "border-rose-200 bg-rose-50/70" : "border-amber-200 bg-amber-50/70"}`}>
          <div className="section-title">Exceptions</div>
          <div className="mt-1 text-base font-semibold text-steel-950">{card.title}</div>
          <div className="mt-3 space-y-2">
            {card.items.map((item) => (
              <div key={item} className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm text-steel-700">{item}</div>
            ))}
          </div>
        </div>
      );
    }

    if (card.type === "approval") {
      return (
        <div key={card.id} className="rounded-[22px] border border-orange-200 bg-orange-50/70 p-4">
          <div className="section-title">Approval required</div>
          <div className="mt-1 text-base font-semibold text-steel-950">{card.approval.title}</div>
          <div className="mt-1 text-sm text-steel-700">{card.approval.detail}</div>
        </div>
      );
    }

    return null;
  };

  const visibleSessions = sessions.filter((session) => session.status !== "discarded");

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_300px]">
        <div className="panel-industrial flex min-h-[760px] flex-col gap-4 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="section-title">Quote Desk</div>
              <h3 className="font-['Sora'] text-3xl font-semibold tracking-[-0.04em] text-steel-950">Conversation-led quoting</h3>
              <p className="mt-2 max-w-2xl text-sm text-steel-600">
                Ask for the next quoting action in chat. The agent pulls the buyer email, parses the RFQ, checks stock, prepares pricing, and stops for approval before any send.
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
              <button className="btn-secondary" disabled={!activeSession || busy} onClick={() => void runSessionAction("save")}>Save Draft</button>
              <button className="btn-ghost" disabled={!activeSession || busy} onClick={() => void discardWorkflow()}>Discard</button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-[24px] border border-steel-200 bg-white/72 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="section-title">Workspace</div>
                  <div className="mt-1 text-lg font-semibold text-steel-950">{activeSession?.title || "No active quote yet"}</div>
                  <div className="mt-1 text-sm text-steel-600">
                    {activeSession
                      ? `${activeSession.buyerEmail || "Buyer not linked"} · last updated ${formatTime(activeSession.updatedAt)}`
                      : "Start a new workflow from chat or use one of the suggested prompts."}
                  </div>
                </div>
                {activeSession && (
                  <span className={`status-chip ${statusTone[activeSession.status] || "status-chip-steel"}`}>
                    {activeSession.status.replace(/_/g, " ")}
                  </span>
                )}
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
              <div className="section-title">Commercial controls</div>
              <div className="mt-2 flex items-center justify-between text-sm font-medium text-steel-800">
                <span>Profit margin</span>
                <span>{pendingMargin}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                value={pendingMargin}
                className="mt-3 w-full"
                disabled={!activeSession || busy}
                onChange={(e) => setPendingMargin(Number(e.target.value))}
              />
              <button className="btn mt-3 w-full" disabled={!activeSession || busy} onClick={() => void runSessionAction("update_margin", { marginPercent: pendingMargin })}>
                Apply Margin
              </button>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl border border-steel-200 bg-steel-50/80 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Saved</div>
                  <div className="mt-1 font-semibold text-steel-900">{activeSession?.savedAt ? "Yes" : "No"}</div>
                </div>
                <div className="rounded-2xl border border-steel-200 bg-steel-50/80 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Approval</div>
                  <div className="mt-1 font-semibold text-steel-900">{activeSession?.approval?.status || "n/a"}</div>
                </div>
              </div>
              <div className="mt-3 text-xs leading-5 text-steel-600">
                Margin updates recalculate the proposed pricing before approval. Sending remains gated until you approve explicitly.
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {starterPrompts.map((prompt) => (
              <button key={prompt} className="btn-secondary text-left" onClick={() => void sendCommand(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-[26px] border border-steel-200 bg-[#f7fafc] p-4">
            {!activeSession && (
              <div className="mx-auto max-w-3xl space-y-3">
                <div className="rounded-[24px] border border-dashed border-steel-300 bg-white px-5 py-10 text-center">
                  <div className="text-sm font-medium text-steel-900">Start a quote workflow</div>
                  <div className="mt-2 text-sm text-steel-600">Type a request like “Quote the latest email from the buyer.” The agent will show each completed step here in the thread.</div>
                </div>
              </div>
            )}

            {activeSession && (
              <div className="mx-auto max-w-[1400px] space-y-4">
                <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_300px]">
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
                            : activeSession.rfqText || "Type a command to pull in the latest buyer request."}
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
                          Review requested specs, stock coverage, and pricing in one place before sending.
                        </div>
                      </div>
                      {quoteCard?.type === "quote_preview" && (
                        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-right">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-700">Quote total</div>
                          <div className="mt-1 text-lg font-semibold text-orange-800">{money(quoteCard.total)}</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 overflow-hidden rounded-[22px] border border-steel-200">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-steel-50/80 text-steel-600">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Requested item</th>
                              <th className="px-4 py-3 font-semibold">Qty</th>
                              <th className="px-4 py-3 font-semibold">Stock</th>
                              <th className="px-4 py-3 font-semibold">Matched SKU</th>
                              <th className="px-4 py-3 font-semibold">Unit price</th>
                              <th className="px-4 py-3 font-semibold">Extended</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workspaceRows.length ? workspaceRows.map((row) => (
                              <tr key={row.id} className="border-t border-steel-200/80 bg-white align-top">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-steel-900">{row.requestedLabel}</div>
                                  <div className="mt-1 text-xs leading-5 text-steel-500">{row.requestedSpecs}</div>
                                </td>
                                <td className="px-4 py-3 text-steel-800">{row.quantity}</td>
                                <td className="px-4 py-3">
                                  {row.stockStatus ? (
                                    <div className="flex items-center gap-2">
                                      <span className={`h-2.5 w-2.5 rounded-full ${stockColor(row.stockStatus)}`} />
                                      <span className="text-steel-800">{stockLabel(row.stockStatus)}</span>
                                      <span className="text-xs text-steel-500">{row.score}</span>
                                    </div>
                                  ) : (
                                    <span className="text-steel-500">Pending</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-steel-800">{row.matchedSku}</td>
                                <td className="px-4 py-3 text-steel-800">{row.unitPrice}</td>
                                <td className="px-4 py-3 font-medium text-steel-900">{row.extendedPrice}</td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-sm text-steel-500">
                                  The workspace will fill after the agent parses an RFQ.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {(quoteCard?.type === "quote_preview" || latestAssistantMessage) && (
                      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="rounded-[22px] border border-steel-200 bg-steel-50/70 p-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Latest agent note</div>
                          <div className="mt-2 text-sm leading-6 text-steel-800">
                            {latestAssistantMessage?.content || "The agent will summarize its latest action here."}
                          </div>
                        </div>
                        <div className="rounded-[22px] border border-steel-200 bg-white p-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Draft email</div>
                          <div className="mt-2 text-sm font-medium text-steel-900">
                            {quoteCard?.type === "quote_preview" ? quoteCard.draftSubject : "No draft yet"}
                          </div>
                          <div className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5 text-steel-600">
                            {quoteCard?.type === "quote_preview"
                              ? quoteCard.draftBody
                              : "Once pricing is ready, the outbound draft will appear here."}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  <aside className="space-y-4">
                    <div className="rounded-[24px] border border-steel-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                      <div className="section-title">Approval</div>
                      <div className="mt-2 text-lg font-semibold text-steel-950">
                        {approvalCard?.type === "approval" ? approvalCard.approval.title : "No approval open"}
                      </div>
                      <div className="mt-2 text-sm text-steel-600">
                        {approvalCard?.type === "approval"
                          ? approvalCard.approval.detail
                          : activeSession.approval?.status === "pending"
                            ? activeSession.approval.detail
                            : "The workflow will stop here before any outbound send."}
                      </div>
                      {activeSession.approval?.status === "pending" && (
                        <button className="btn mt-4 w-full" disabled={busy} onClick={() => setApprovalModal(activeSession.approval || null)}>
                          Review approval
                        </button>
                      )}
                    </div>

                    <div className="rounded-[24px] border border-steel-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
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
                        )) : (
                          <div className="rounded-2xl border border-steel-200 bg-steel-50/70 px-3 py-3 text-sm text-steel-600">
                            No open exceptions.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-steel-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                      <div className="section-title">Recent activity</div>
                      <div className="mt-3 space-y-2">
                        {activeSession.activities.length ? activeSession.activities.slice(0, 5).map((activity) => (
                          <div key={activity.id} className="rounded-2xl border border-steel-200/80 bg-steel-50/60 px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-steel-500">
                              {activity.actor} · {activity.kind}
                            </div>
                            <div className="mt-1 text-sm text-steel-800">{activity.detail}</div>
                          </div>
                        )) : (
                          <div className="rounded-2xl border border-steel-200 bg-steel-50/70 px-3 py-3 text-sm text-steel-600">
                            No activity yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </aside>
                </div>

                <div className="hidden">
                  {activeSession.cards.map(renderCard)}
                </div>
                <div ref={endRef} />
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-steel-200 bg-white/86 p-4">
            <div className="flex flex-col gap-3">
              <textarea
                className="input min-h-24"
                placeholder="Ask to quote the latest email, change a quantity, apply a lead time, revise tone, or approve the send."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button className="btn" disabled={busy} onClick={() => void sendCommand(input)}>{busy ? "Working..." : "Send Command"}</button>
                {activeSession?.approval?.status === "pending" && (
                  <button className="btn-secondary" disabled={busy} onClick={() => setApprovalModal(activeSession.approval || null)}>
                    Review Approval
                  </button>
                )}
              </div>
            </div>
            {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
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
            <div className="section-title">Activity timeline</div>
            <div className="mt-3 space-y-2">
              {activeSession?.activities.length ? activeSession.activities.map((activity) => (
                <div key={activity.id} className="rounded-2xl border border-steel-200/70 bg-white/75 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-steel-500">{activity.actor} · {activity.kind}</div>
                  <div className="mt-1 text-sm text-steel-800">{activity.detail}</div>
                </div>
              )) : <div className="text-sm text-steel-600">No activity yet.</div>}
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
              No outbound quote email will be sent until you approve this action.
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
