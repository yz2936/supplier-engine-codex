"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { money, stockColor, stockLabel, summarizeRequestedSpecs } from "@/lib/format";
import { extractTextFromRfqFile, RFQ_FILE_ACCEPT } from "@/lib/rfq-file";
import { QuoteAgentSession, QuoteApprovalRequest, QuantityUnit } from "@/lib/types";

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
const truncate = (value: string, max = 88) => value.length > max ? `${value.slice(0, max - 3)}...` : value;
const stockCardTone = {
  green: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
  yellow: "border-amber-200 bg-amber-50/80 text-amber-900",
  red: "border-rose-200 bg-rose-50/80 text-rose-900"
} as const;
const stockActionCopy = {
  green: "Ready to quote from inventory",
  yellow: "Partial stock. Source the shortage before sending.",
  red: "No stock available. Route this line to sourcing."
} as const;

type ConversationQuoteDeskProps = {
  requestedSession?: QuoteAgentSession | null;
  onSourceLine?: (seed: {
    key: string;
    sourceContext: "quote_shortage";
    reason: "low_stock" | "out_of_stock" | "new_demand";
    sku?: string;
    productType: string;
    grade: string;
    dimension?: string;
    quantity: number;
    unit: QuantityUnit;
    requestedLength?: number;
  }) => void;
};

export function ConversationQuoteDesk({ requestedSession, onSourceLine }: ConversationQuoteDeskProps) {
  const [sessions, setSessions] = useState<QuoteAgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [isNewWorkflow, setIsNewWorkflow] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [manualBuyerName, setManualBuyerName] = useState("");
  const [manualBuyerEmail, setManualBuyerEmail] = useState("");
  const [manualSubject, setManualSubject] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [manualImportInfo, setManualImportInfo] = useState("");
  const [showManualIntake, setShowManualIntake] = useState(false);
  const [fileImportInfo, setFileImportInfo] = useState("");
  const [approvalModal, setApprovalModal] = useState<QuoteApprovalRequest | null>(null);
  const [pendingMargin, setPendingMargin] = useState(12);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeSession = useMemo(() => {
    if (isNewWorkflow) return null;
    if (!activeSessionId) return null;
    return sessions.find((session) => session.id === activeSessionId) || null;
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
        requestedLine: extractedLine || quoteLine?.requested,
        requestedLabel: extractedLine
          ? truncate(extractedLine.sourceText || extractedLine.rawSpec || [extractedLine.grade, extractedLine.category].filter(Boolean).join(" "))
          : truncate(quoteLine?.requested.sourceText || quoteLine?.requested.rawSpec || quoteLine?.description || "Unparsed item"),
        requestedSpecs: extractedLine
          ? summarizeRequestedSpecs(extractedLine).join(" | ") || extractedLine.rawSpec
          : quoteLine?.requested
            ? summarizeRequestedSpecs(quoteLine.requested).join(" | ") || quoteLine.requested.rawSpec
            : "Awaiting parse",
        quantity: extractedLine
          ? `${extractedLine.quantity} ${extractedLine.quantityUnit}`
          : quoteLine
            ? `${quoteLine.quantity} ${quoteLine.unit}`
            : "-",
        requestedQuantityValue: extractedLine?.quantity ?? quoteLine?.quantity ?? 0,
        requestedQuantityUnit: extractedLine?.quantityUnit ?? quoteLine?.unit ?? "unknown",
        score: typeof match?.score === "number" ? `${Math.round(match.score * 100)}%` : "Pending",
        unitPrice: typeof quoteLine?.unitPrice === "number" ? money(quoteLine.unitPrice) : "Pending",
        extendedPrice: typeof quoteLine?.extendedPrice === "number" ? money(quoteLine.extendedPrice) : "Pending",
        match,
        stockStatus: match?.stockStatus || quoteLine?.stockStatus || "red"
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
    setActiveSessionId((current: string) => json.sessions?.some((session: QuoteAgentSession) => session.id === current) ? current : "");
  };

  useEffect(() => {
    void loadSessions().catch((err) => setError(err instanceof Error ? err.message : "Failed to load quote sessions"));
  }, []);

  useEffect(() => {
    if (!requestedSession) return;
    upsertSession(requestedSession);
  }, [requestedSession]);

  const sendCommand = async (command: string, options?: { forceNew?: boolean; payload?: Record<string, unknown> }) => {
    const text = command.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/agent/quote", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: options?.forceNew || isNewWorkflow ? "" : activeSession?.id,
          command: text,
          ...(options?.payload || {})
        })
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

  const importForwardedEmail = async () => {
    if (busy) return;
    const buyerEmail = manualBuyerEmail.trim().toLowerCase();
    const bodyText = manualBody.trim();
    if (!buyerEmail || !bodyText) {
      setError("Buyer email and forwarded email body are required.");
      return;
    }

    setBusy(true);
    setError("");
    setInfo("");
    setManualImportInfo("Opening quote workflow from forwarded email...");
    try {
      const quoteRes = await fetch("/api/agent/quote", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: manualSubject.trim()
            ? `Quote this forwarded buyer email. Subject: ${manualSubject.trim()}`
            : "Quote this forwarded buyer email.",
          buyerName: manualBuyerName.trim() || undefined,
          buyerEmail,
          rfqText: bodyText,
          subject: manualSubject.trim() || undefined
        })
      });
      const quoteJson = await quoteRes.json();
      if (!quoteRes.ok) throw new Error(quoteJson.error || "Quote agent failed");

      upsertSession(quoteJson.session);
      try {
        await fetch("/api/email/inbound/manual", {
          credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyerName: manualBuyerName,
            buyerEmail,
            subject: manualSubject,
            bodyText
          })
        });
      } catch {
        // Best-effort inbox logging should not block quote creation.
      }

      setManualImportInfo(`Opened the quote workflow from ${buyerEmail}.`);
      setManualBuyerName("");
      setManualBuyerEmail("");
      setManualSubject("");
      setManualBody("");
      setShowManualIntake(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import forwarded email");
      setManualImportInfo("");
    } finally {
      setBusy(false);
    }
  };

  const importRfqFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || busy) return;
    setBusy(true);
    setError("");
    setInfo("");
    setFileImportInfo("Reading intake files...");
    try {
      const files = Array.from(fileList);
      const extracted = await Promise.all(files.map(async (file) => {
        const result = await extractTextFromRfqFile(file);
        return {
          name: file.name,
          text: result.text
        };
      }));
      const rfqText = extracted.map((entry) => `[Source File: ${entry.name}]\n${entry.text}`).join("\n\n");
      const subject = files.length === 1 ? `Uploaded RFQ: ${files[0].name}` : `Uploaded RFQ package (${files.length} files)`;
      const res = await fetch("/api/agent/quote", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "Quote this uploaded RFQ package.",
          buyerName: manualBuyerName.trim() || undefined,
          buyerEmail: manualBuyerEmail.trim().toLowerCase() || undefined,
          rfqText,
          subject
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Quote agent failed");
      upsertSession(json.session);
      setFileImportInfo(`Opened quote workflow from ${files.length} intake file${files.length === 1 ? "" : "s"}.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowManualIntake(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read intake files");
      setFileImportInfo("");
    } finally {
      setBusy(false);
    }
  };

  const runSessionAction = async (action: "save" | "update_margin", body?: Record<string, unknown>) => {
    if (!activeSession) return;
    setBusy(true);
    setError("");
    setInfo("");
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
    setInfo("");
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
    const pendingApproval = approvalModal;
    setBusy(true);
    setError("");
    setInfo("");
    setApprovalModal(null);
    try {
      const res = await fetch(`/api/agent/quote/${activeSession.id}/approve`, {
        credentials: "include",
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Approval failed");
      upsertSession(json.session);
      setInfo(`Quote email sent to ${json.session?.buyerEmail || activeSession.buyerEmail || "buyer"}.`);
      await loadSessions();
    } catch (err) {
      setApprovalModal(pendingApproval);
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  };

  const visibleSessions = sessions.filter((session) => session.status !== "discarded");
  const approvalPending = activeSession?.approval?.status === "pending";
  const draftReady = activeSession?.stage === "draft_ready" || activeSession?.stage === "awaiting_approval" || activeSession?.stage === "sent";
  const parseReady = Boolean(extractionCard?.type === "rfq_extraction");
  const sendButtonLabel = approvalPending
    ? "Approve & Send"
    : activeSession?.stage === "sent" || activeSession?.status === "completed"
      ? "Sent"
      : "Awaiting Approval";

  return (
    <>
      <div className="space-y-4">
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
              <button className="btn-secondary" disabled={busy} onClick={() => void sendCommand("Quote the latest email from the buyer.", { forceNew: true })}>
                {busy ? "Parsing..." : "Parse Email"}
              </button>
              <button className="btn-secondary" disabled={busy} onClick={() => setShowManualIntake((value) => !value)}>
                {showManualIntake ? "Hide Manual Intake" : "Paste Forwarded Email"}
              </button>
              <button className="btn-secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                Upload RFQ Files
              </button>
              <button className="btn-secondary" disabled={!activeSession || busy} onClick={() => void runSessionAction("save")}>Save Draft</button>
              <button className="btn" disabled={!approvalPending || busy} onClick={() => setApprovalModal(activeSession?.approval || null)}>
                {sendButtonLabel}
              </button>
              <button className="btn-ghost" disabled={!activeSession || busy} onClick={() => void discardWorkflow()}>Discard</button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
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

          {showManualIntake && (
            <div className="rounded-[24px] border border-steel-200 bg-white/85 p-5">
              <div className="section-title">Manual Intake</div>
              <div className="mt-1 text-lg font-semibold text-steel-950">Paste a forwarded buyer email</div>
              <div className="mt-2 text-sm text-steel-600">
                Use this when mailbox sync is unreliable. The quote agent will parse directly from the pasted email body, and the tool will log it to the buyer inbox on a best-effort basis.
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input
                  className="input"
                  placeholder="Buyer company or contact (optional)"
                  value={manualBuyerName}
                  onChange={(e) => setManualBuyerName(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Buyer email"
                  value={manualBuyerEmail}
                  onChange={(e) => setManualBuyerEmail(e.target.value)}
                />
                <input
                  className="input md:col-span-2"
                  placeholder="Forwarded email subject (optional)"
                  value={manualSubject}
                  onChange={(e) => setManualSubject(e.target.value)}
                />
                <textarea
                  className="input min-h-[220px] md:col-span-2"
                  placeholder="Paste the forwarded buyer email body here..."
                  value={manualBody}
                  onChange={(e) => setManualBody(e.target.value)}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn" disabled={busy} onClick={() => void importForwardedEmail()}>
                  {busy ? "Opening..." : "Open Quote From Forwarded Email"}
                </button>
              </div>
              {manualImportInfo && <div className="mt-3 text-xs text-steel-700">{manualImportInfo}</div>}
            </div>
          )}

          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept={RFQ_FILE_ACCEPT}
            multiple
            onChange={(e) => void importRfqFiles(e.target.files)}
          />

          {fileImportInfo && (
            <div className="rounded-2xl border border-steel-200 bg-white/80 px-4 py-3 text-xs text-steel-700">
              {fileImportInfo}
            </div>
          )}

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

                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900">
                        In stock {capabilitySummary.green}
                      </div>
                      <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900">
                        Partial {capabilitySummary.yellow}
                      </div>
                      <div className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-900">
                        Out {capabilitySummary.red}
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      {workspaceRows.length ? workspaceRows.map((row) => (
                        <div key={row.id} className="rounded-[22px] border border-steel-200 bg-white px-4 py-4">
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_180px] lg:items-center">
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Requested item</div>
                              <div className="mt-1 text-base font-semibold text-steel-950">{row.requestedLabel}</div>
                              <div className="mt-1 text-sm text-steel-600">{row.quantity}</div>
                              {row.requestedSpecs && row.requestedSpecs !== "Awaiting parse" ? (
                                <div className="mt-1 text-xs leading-5 text-steel-500">{row.requestedSpecs}</div>
                              ) : null}
                            </div>

                            <div className="rounded-2xl border border-steel-200 bg-steel-50/60 px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Inventory match</div>
                                <div className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stockCardTone[row.stockStatus]}`}>
                                  {stockLabel(row.stockStatus)}
                                </div>
                              </div>
                              {row.match?.inventoryItem ? (
                                <>
                                  <div className="mt-2 text-sm font-semibold text-steel-900">
                                    {row.match.inventoryItem.specText || row.match.inventoryItem.sku}
                                  </div>
                                  <div className="mt-1 text-xs text-steel-500">SKU: {row.match.inventoryItem.sku}</div>
                                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-steel-700">
                                    <span>On hand {row.match.inventoryItem.qtyOnHand}</span>
                                    <span>{row.score} match</span>
                                    <span>{row.unitPrice}</span>
                                  </div>
                                  {row.match?.alternatives?.length ? (
                                    <div className="mt-2 text-xs text-steel-500">
                                      {row.match.alternatives.length} alternate match{row.match.alternatives.length === 1 ? "" : "es"} available
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <div className="mt-2 text-sm text-steel-600">No inventory match found for this item.</div>
                              )}
                            </div>

                            <div className="flex flex-col gap-2">
                              <div className={`rounded-2xl border px-3 py-3 text-sm ${stockCardTone[row.stockStatus]}`}>
                                {stockActionCopy[row.stockStatus]}
                              </div>
                              {(row.stockStatus === "yellow" || row.stockStatus === "red") && row.requestedLine && onSourceLine ? (
                                <button
                                  className="btn w-full"
                                  onClick={() => {
                                    onSourceLine({
                                      key: `${activeSession?.id || "quote"}-${row.id}`,
                                      sourceContext: "quote_shortage",
                                      reason: row.stockStatus === "red" ? "out_of_stock" : "low_stock",
                                      sku: row.match?.inventoryItem?.sku,
                                      productType: row.requestedLine?.category || "Unknown",
                                      grade: row.requestedLine?.grade || "Unknown",
                                      dimension: row.requestedLine?.dimensionSummary || row.requestedLine?.rawSpec,
                                      quantity: row.requestedQuantityValue,
                                      unit: row.requestedQuantityUnit,
                                      requestedLength: row.requestedLine?.length
                                    });
                                  }}
                                >
                                  {row.stockStatus === "red" ? "Source Item" : "Source Shortage"}
                                </button>
                              ) : (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-center text-sm font-medium text-emerald-900">
                                  Ready
                                </div>
                              )}
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

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px_280px]">
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
              {!error && info && <div className="mt-3 text-sm text-teal-700">{info}</div>}
            </div>

            <div className="rounded-[24px] border border-steel-200 bg-white/86 p-4">
              <div className="section-title">Review status</div>
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl border border-steel-200 bg-steel-50/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Workflow</div>
                  <div className="mt-1 font-semibold text-steel-900">{activeSession?.status ? activeSession.status.replace(/_/g, " ") : "n/a"}</div>
                </div>
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
                <div className="rounded-2xl border border-steel-200 bg-steel-50/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Last activity</div>
                  <div className="mt-1 font-semibold text-steel-900">{activeSession?.updatedAt ? formatTime(activeSession.updatedAt) : "n/a"}</div>
                </div>
                <div className="rounded-2xl border border-steel-200 bg-steel-50/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Exceptions</div>
                  <div className="mt-1 text-sm text-steel-900">
                    {riskCards.length ? riskCards.map((card) => card.title).join(", ") : "No open exceptions"}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[24px] border border-steel-200 bg-white/86 p-4">
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
