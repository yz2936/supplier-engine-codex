"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { money, stockColor, stockLabel, summarizeRequestedSpecs } from "@/lib/format";
import {
  QuoteAgentSession,
  QuoteApprovalRequest,
  QuoteUiCard
} from "@/lib/types";

type Props = {
  onOpenWorkspace?: () => void;
};

const starterPrompts = [
  "Quote the latest email from the buyer.",
  "Show me the buyer email again.",
  "Don't include the out-of-stock items.",
  "Change the lead time to 8 weeks."
];

const stageLabels = [
  { key: "email_selected", label: "Email" },
  { key: "rfq_parsed", label: "Parse" },
  { key: "inventory_checked", label: "Inventory" },
  { key: "draft_ready", label: "Draft" },
  { key: "awaiting_approval", label: "Approval" },
  { key: "sent", label: "Sent" }
] as const;

export function ConversationQuoteDesk({ onOpenWorkspace }: Props) {
  const [sessions, setSessions] = useState<QuoteAgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approvalModal, setApprovalModal] = useState<QuoteApprovalRequest | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0] || null,
    [activeSessionId, sessions]
  );

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
  }, [activeSession?.messages]);

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
      onOpenWorkspace?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  };

  const renderCard = (card: QuoteUiCard) => {
    if (card.type === "email_preview") {
      return (
        <div key={card.id} className="landing-card space-y-2">
          <div className="section-title">Email preview</div>
          <div className="text-lg font-semibold text-steel-900">{card.email.subject || "(No subject)"}</div>
          <div className="text-xs text-steel-600">{card.email.fromEmail} · {new Date(card.email.receivedAt).toLocaleString()}</div>
          <div className="max-h-44 overflow-auto rounded-2xl border border-steel-200 bg-white/70 p-3 text-sm text-steel-700 whitespace-pre-wrap">
            {card.email.bodyText}
          </div>
        </div>
      );
    }

    if (card.type === "rfq_extraction") {
      return (
        <div key={card.id} className="landing-card space-y-3">
          <div>
            <div className="section-title">RFQ extraction</div>
            <div className="mt-1 text-sm text-steel-600">{card.summary}</div>
          </div>
          <div className="space-y-2">
            {card.lineItems.map((item, index) => (
              <div key={`${item.rawSpec}-${index}`} className="rounded-2xl border border-steel-200/70 bg-white/70 p-3">
                <div className="font-medium text-steel-900">{item.grade} {item.category}</div>
                <div className="mt-1 text-xs text-steel-600">{summarizeRequestedSpecs(item).join(" | ") || item.rawSpec}</div>
                <div className="mt-1 text-xs text-steel-700">{item.quantity} {item.quantityUnit}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (card.type === "inventory_match") {
      return (
        <div key={card.id} className="landing-card space-y-3">
          <div className="section-title">Inventory comparison</div>
          <div className="overflow-auto rounded-2xl border border-steel-200 bg-white/80">
            <table className="data-grid min-w-[720px] border-0">
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
                    <td className="py-3 pr-3 text-sm text-steel-800">{match.requested.grade} {match.requested.category}</td>
                    <td className="py-3 pr-3 text-sm text-steel-700">{match.inventoryItem?.sku || "No inventory match"}</td>
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
        <div key={card.id} className="landing-card space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-title">Quote preview</div>
              <div className="mt-1 text-lg font-semibold text-steel-900">{card.customerName}</div>
              <div className="text-sm text-steel-600">{card.buyerEmail}</div>
            </div>
            <button className="btn-secondary" onClick={() => onOpenWorkspace?.()}>Open Workspace</button>
          </div>
          <div className="overflow-auto rounded-2xl border border-steel-200 bg-white/80">
            <table className="data-grid min-w-[760px] border-0">
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
          <div className="rounded-2xl border border-steel-200 bg-steel-50/80 p-3 text-sm text-steel-700">
            <div><span className="font-medium text-steel-900">Draft subject:</span> {card.draftSubject}</div>
            <div className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-xs">{card.draftBody}</div>
            <div className="mt-3 font-semibold text-steel-900">Total {money(card.total)}</div>
          </div>
        </div>
      );
    }

    if (card.type === "risk_alert") {
      return (
        <div key={card.id} className={`landing-card ${card.severity === "critical" ? "border-rose-200" : "border-amber-200"}`}>
          <div className="section-title">Exceptions</div>
          <div className="mt-2 text-lg font-semibold text-steel-900">{card.title}</div>
          <div className="mt-3 space-y-2">
            {card.items.map((item) => (
              <div key={item} className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-sm text-steel-700">{item}</div>
            ))}
          </div>
        </div>
      );
    }

    if (card.type === "approval") {
      return (
        <div key={card.id} className="landing-card border-amber-200">
          <div className="section-title">Approval required</div>
          <div className="mt-2 text-lg font-semibold text-steel-900">{card.approval.title}</div>
          <div className="mt-1 text-sm text-steel-600">{card.approval.detail}</div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_320px]">
        <div className="panel-industrial flex min-h-[760px] flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="section-title">Conversation-driven quoting</div>
              <h3 className="font-['Sora'] text-3xl font-semibold tracking-[-0.04em] text-steel-950">Quote command center</h3>
              <p className="mt-2 max-w-2xl text-sm text-steel-600">
                Use chat as the primary control surface. The agent can pull the latest buyer email, parse the RFQ, check inventory, draft the quote, and stop for approval before any outbound send.
              </p>
            </div>
            <div className="status-chip status-chip-steel">{activeSession?.stage || "idle"}</div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {starterPrompts.map((prompt) => (
              <button key={prompt} className="btn-secondary text-left" onClick={() => void sendCommand(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto rounded-[24px] border border-steel-200 bg-white/70 p-4">
            {!activeSession && (
              <div className="rounded-2xl border border-dashed border-steel-300 bg-white/80 px-4 py-10 text-center text-sm text-steel-600">
                Start by asking the agent to quote the latest buyer email.
              </div>
            )}
            {activeSession && (
              <div className="landing-card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="section-title">Workflow progress</div>
                    <div className="mt-1 text-lg font-semibold text-steel-900">{activeSession.title}</div>
                  </div>
                  <div className="status-chip status-chip-steel">{activeSession.status}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {stageLabels.map((stage) => {
                    const isActive = activeSession.stage === stage.key;
                    const isCompleted = stageLabels.findIndex((item) => item.key === activeSession.stage) >= stageLabels.findIndex((item) => item.key === stage.key);
                    return (
                      <div
                        key={stage.key}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
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
            )}
            {activeSession?.messages.map((message) => (
              <div
                key={message.id}
                className={message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm"
                  : message.role === "system"
                    ? "max-w-[90%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    : "max-w-[90%] rounded-2xl border border-steel-200 bg-white px-4 py-3 text-sm"}
              >
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-steel-500">{message.role}</div>
                <div className="text-steel-800">{message.content}</div>
              </div>
            ))}
            {activeSession?.cards.map(renderCard)}
            <div ref={endRef} />
          </div>

          <div className="rounded-[24px] border border-steel-200 bg-white/80 p-4">
            <div className="flex flex-col gap-3">
              <textarea
                className="input min-h-24"
                placeholder="Ask the agent to quote the latest buyer email, revise a line item, update lead time, or approve the send."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button className="btn" disabled={busy} onClick={() => void sendCommand(input)}>{busy ? "Working..." : "Send Command"}</button>
                {activeSession?.approval?.status === "pending" && (
                  <button className="btn-secondary" disabled={busy} onClick={() => setApprovalModal(activeSession.approval || null)}>Review Approval</button>
                )}
              </div>
            </div>
            {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
          </div>
        </div>

        <div className="space-y-4">
          <div className="landing-card">
            <div className="section-title">Quote sessions</div>
            <div className="mt-3 space-y-2">
              {sessions.length ? sessions.map((session) => (
                <button
                  key={session.id}
                  className={activeSession?.id === session.id
                    ? "w-full rounded-2xl border border-orange-300 bg-orange-50/70 px-3 py-3 text-left"
                    : "w-full rounded-2xl border border-steel-200 bg-white/75 px-3 py-3 text-left"}
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <div className="font-medium text-steel-900">{session.title}</div>
                  <div className="mt-1 text-xs text-steel-600">{session.status} · {new Date(session.updatedAt).toLocaleString()}</div>
                </button>
              )) : <div className="text-sm text-steel-600">No quote sessions yet.</div>}
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
