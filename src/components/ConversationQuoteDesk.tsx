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
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approvalModal, setApprovalModal] = useState<QuoteApprovalRequest | null>(null);
  const [pendingMargin, setPendingMargin] = useState(12);
  const endRef = useRef<HTMLDivElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0] || null,
    [activeSessionId, sessions]
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
    setActiveSessionId(next.id);
    if (next.approval?.status === "pending") setApprovalModal(next.approval);
    else setApprovalModal(null);
  };

  const loadSessions = async () => {
    const res = await fetch("/api/agent/quote", { credentials: "include", cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load quote sessions");
    setSessions(json.sessions || []);
    if (json.sessions?.[0]?.id) setActiveSessionId((current: string) => current || json.sessions[0].id);
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
        body: JSON.stringify({ sessionId: activeSession?.id, command: text })
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
      setSessions((prev) => prev.map((session) => session.id === json.session.id ? json.session : session));
      setApprovalModal(null);
      const nextActive = sessions.find((session) => session.id !== activeSession.id && session.status !== "discarded");
      setActiveSessionId(nextActive?.id || "");
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
        <div key={card.id} className="rounded-[22px] border border-steel-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-title">Buyer email</div>
              <div className="mt-1 text-base font-semibold text-steel-950">{card.email.subject || "(No subject)"}</div>
              <div className="mt-1 text-xs text-steel-600">{card.email.fromEmail} · {formatTime(card.email.receivedAt)}</div>
            </div>
            <span className="rounded-full border border-steel-200 bg-steel-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-600">
              Source
            </span>
          </div>
          <div className="mt-3 max-h-40 overflow-auto rounded-2xl border border-steel-200 bg-steel-50/80 p-3 text-sm leading-6 text-steel-700 whitespace-pre-wrap">
            {card.email.bodyText}
          </div>
        </div>
      );
    }

    if (card.type === "rfq_extraction") {
      return (
        <div key={card.id} className="rounded-[22px] border border-steel-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-title">Parsed RFQ</div>
              <div className="mt-1 text-sm text-steel-600">{card.summary}</div>
            </div>
            <div className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">
              {card.lineItems.length} lines
            </div>
          </div>
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
        </div>
      );
    }

    if (card.type === "inventory_match") {
      return (
        <div key={card.id} className="rounded-[22px] border border-steel-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="section-title">Inventory check</div>
              <div className="mt-1 text-sm text-steel-600">Each requested line is matched against current inventory before pricing is proposed.</div>
            </div>
          </div>
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
        </div>
      );
    }

    if (card.type === "quote_preview") {
      return (
        <div key={card.id} className="rounded-[22px] border border-steel-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="section-title">Quote draft</div>
              <div className="mt-1 text-base font-semibold text-steel-950">{card.customerName}</div>
              <div className="text-sm text-steel-600">{card.buyerEmail}</div>
            </div>
            <div className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-700">
              Total {money(card.total)}
            </div>
          </div>
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
          <div className="mt-3 rounded-2xl border border-steel-200 bg-steel-50/80 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Outbound draft</div>
            <div className="mt-1 text-sm font-medium text-steel-900">{card.draftSubject}</div>
            <div className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-5 text-steel-700">{card.draftBody}</div>
          </div>
        </div>
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
                  <div className="section-title">Workflow status</div>
                  <div className="mt-1 text-lg font-semibold text-steel-950">{activeSession?.title || "No active quote yet"}</div>
                  <div className="mt-1 text-sm text-steel-600">
                    {activeSession
                      ? `${activeSession.buyerEmail || "Buyer not linked"} · last updated ${formatTime(activeSession.updatedAt)}`
                      : "Start a workflow from chat or use one of the suggested prompts."}
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
              <div className="mx-auto max-w-4xl space-y-3">
                {activeSession.messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.role === "user"
                      ? "ml-auto max-w-[82%] rounded-[22px] border border-teal-200 bg-teal-50 px-4 py-3"
                      : message.role === "system"
                        ? "max-w-[88%] rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3"
                        : "max-w-[88%] rounded-[22px] border border-steel-200 bg-white px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.04)]"}
                  >
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-steel-500">{message.role}</div>
                    <div className="text-sm leading-6 text-steel-800">{message.content}</div>
                  </div>
                ))}

                {activeSession.cards.map(renderCard)}
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
                  onClick={() => setActiveSessionId(session.id)}
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
