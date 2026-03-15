"use client";

import { useState } from "react";
import { money, stockLabel } from "@/lib/format";
import { RFQ_FILE_ACCEPT } from "@/lib/rfq-file";
import { QuoteAgentSession, QuantityUnit } from "@/lib/types";
import { useQuoteDeskController } from "@/components/quote-desk/useQuoteDeskController";

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
const stockActionCopy = {
  green: "Ready to quote from inventory",
  yellow: "Partial stock. Source the shortage before sending.",
  red: "No stock available. Route this line to sourcing."
} as const;
const stockStatusTextTone = {
  green: "text-emerald-700",
  yellow: "text-amber-700",
  red: "text-rose-700"
} as const;

type ConversationQuoteDeskProps = {
  requestedSession?: QuoteAgentSession | null;
  onSelectItemsToBid?: () => void;
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

export function ConversationQuoteDesk({ requestedSession, onSelectItemsToBid, onSourceLine }: ConversationQuoteDeskProps) {
  const [showQuotePreview, setShowQuotePreview] = useState(false);
  const {
    activeSession,
    approvalModal,
    approvalPending,
    busy,
    capabilitySummary,
    draftReady,
    emailCard,
    error,
    fileImportInfo,
    fileInputRef,
    info,
    input,
    latestAssistantMessage,
    manualBody,
    manualBuyerEmail,
    manualBuyerName,
    manualImportInfo,
    manualSubject,
    parseReady,
    pendingMargin,
    quoteCard,
    requestPreviewLines,
    riskCards,
    sendButtonLabel,
    setApprovalModal,
    setInput,
    setManualBody,
    setManualBuyerEmail,
    setManualBuyerName,
    setManualSubject,
    setPendingMargin,
    setShowManualIntake,
    showManualIntake,
    startNewWorkflow,
    approveSend,
    discardWorkflow,
    importForwardedEmail,
    importRfqFiles,
    runSessionAction,
    selectSession,
    sendCommand,
    visibleSessions,
    workspaceRows
  } = useQuoteDeskController({ requestedSession });

  const sourceText = activeSession?.intakeSourceText || (emailCard?.type === "email_preview" ? emailCard.email.bodyText : "") || activeSession?.rfqText || "";
  const sourcePreviewLines = sourceText.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 10);
  const extractedItemsCount = requestPreviewLines.length;
  const hasScopedSelection = Boolean(
    activeSession?.intakeSourceText &&
    activeSession?.intakeSelectionText &&
    activeSession.intakeSourceText.trim() !== activeSession.intakeSelectionText.trim()
  );
  const firstShortageRow = workspaceRows.find((row) => row.stockStatus === "yellow" || row.stockStatus === "red");
  const shortageCount = workspaceRows.filter((row) => row.stockStatus === "yellow" || row.stockStatus === "red").length;
  const sourceKindLabel = activeSession?.intakeSourceType === "buyer_message"
    ? "Buyer Inbox"
    : activeSession?.intakeSourceType === "pasted_email"
      ? "Pasted Email"
      : activeSession?.intakeSourceType === "uploaded_files"
        ? "Uploaded Files"
        : "Manual Intake";

  return (
    <>
      <div className="space-y-4">
        <div className="panel-industrial flex min-h-[840px] flex-col overflow-hidden">
          <div className="sticky top-0 z-20 border-b border-steel-200 bg-[linear-gradient(180deg,rgba(246,249,252,0.98),rgba(255,255,255,0.94))] px-5 py-4 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <div>
                  <div className="section-title">Quote Desk</div>
                  <h3 className="font-['Sora'] text-3xl font-semibold tracking-[-0.04em] text-steel-950">Focused RFQ workspace</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={startNewWorkflow}>New Workflow</button>
                  <button className="btn-secondary" onClick={onSelectItemsToBid}>Select Items To Bid</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => setShowManualIntake((value) => !value)}>
                    {showManualIntake ? "Hide Pasted Email" : "Paste Forwarded Email"}
                  </button>
                  <button className="btn-secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                    Upload RFQ Files
                  </button>
                </div>
              </div>

              <div className="min-w-[300px] max-w-[640px] rounded-[24px] border border-steel-200 bg-white/88 px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-steel-500">Active RFQ</div>
                    <div className="mt-1 text-lg font-semibold text-steel-950">{activeSession?.title || "No active quote yet"}</div>
                    <div className="mt-1 text-sm text-steel-600">
                      {activeSession
                        ? `${activeSession.buyerEmail || "Buyer not linked"} · ${activeSession.intakeSourceLabel || "Unspecified intake"}`
                        : "Choose a routed RFQ, pasted email, or uploaded file package."}
                    </div>
                  </div>
                  {activeSession ? (
                    <span className={`status-chip ${statusTone[activeSession.status] || "status-chip-steel"}`}>
                      {activeSession.status.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {stageLabels.map((stage) => {
                    const isActive = activeSession?.stage === stage.key;
                    const currentIndex = stageLabels.findIndex((item) => item.key === activeSession?.stage);
                    const stageIndex = stageLabels.findIndex((item) => item.key === stage.key);
                    const isCompleted = currentIndex >= stageIndex && currentIndex !== -1;
                    return (
                      <div
                        key={stage.key}
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                          isActive
                            ? "border-steel-400 bg-steel-950 text-white"
                            : isCompleted
                              ? "border-steel-300 bg-steel-100 text-steel-800"
                              : "border-steel-200 bg-white text-steel-500"
                        }`}
                      >
                        {stage.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {showManualIntake && (
            <div className="border-b border-steel-200 bg-white/90 px-5 py-4">
              <div className="rounded-[24px] border border-steel-200 bg-[#fbfcfd] p-5">
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
            <div className="mx-5 mt-4 rounded-2xl border border-steel-200 bg-white/80 px-4 py-3 text-xs text-steel-700">
              {fileImportInfo}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto bg-[#f6f8fb] px-5 py-5">
            {!activeSession && (
              <div className="mx-auto max-w-4xl rounded-[28px] border border-dashed border-steel-300 bg-white px-8 py-14 text-center shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-steel-500">No RFQ selected</div>
                <div className="mt-3 text-2xl font-semibold text-steel-950">Select items to bid before opening Quote Desk</div>
                <div className="mt-3 text-sm text-steel-600">
                  This workspace only opens from an explicit intake source. Start from Buyers, paste a forwarded RFQ, or upload a file package.
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button className="btn" onClick={onSelectItemsToBid}>Go To Buyers</button>
                  <button className="btn-secondary" onClick={() => setShowManualIntake(true)}>Paste Forwarded Email</button>
                  <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>Upload RFQ Files</button>
                </div>
              </div>
            )}

            {activeSession && (
              <div className="mx-auto max-w-[1580px] space-y-4 pb-28">
                <div className="grid gap-4 xl:grid-cols-[minmax(260px,24%)_minmax(420px,38%)_minmax(420px,38%)]">
                  <section className="space-y-4">
                    <div className="rounded-[24px] border border-steel-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="section-title">RFQ Source</div>
                          <div className="mt-1 text-xl font-semibold text-steel-950">
                            {activeSession?.intakeSourceLabel || emailCard?.type === "email_preview" ? emailCard?.email.subject : "Source pending"}
                          </div>
                        </div>
                        <span className="rounded-full border border-steel-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-steel-600">
                          {sourceKindLabel}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm text-steel-700">
                        <div className="rounded-2xl border border-steel-200 bg-[#f9fbfd] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Buyer</div>
                          <div className="mt-1 font-medium text-steel-900">{activeSession.buyerEmail || "Buyer not linked"}</div>
                          <div className="mt-1 text-xs text-steel-500">Last updated {formatTime(activeSession.updatedAt)}</div>
                        </div>
                        <div className="rounded-2xl border border-steel-200 bg-white px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Provenance</div>
                          <div className="mt-2 text-sm text-steel-700">
                            {activeSession.intakeSourceLabel || "No intake label captured for this session."}
                          </div>
                          {hasScopedSelection ? (
                            <div className="mt-2 rounded-xl border border-steel-200 bg-steel-50 px-3 py-2 text-xs text-steel-600">
                              This quote is scoped to selected bid content from a larger RFQ source.
                            </div>
                          ) : null}
                        </div>
                        <div className="rounded-2xl border border-steel-200 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Source text</div>
                            <div className="text-[11px] text-steel-500">{sourcePreviewLines.length} lines shown</div>
                          </div>
                          <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1 text-sm leading-6 text-steel-700">
                            {sourcePreviewLines.length ? sourcePreviewLines.map((line, index) => (
                              <div key={`${index}-${line}`} className="rounded-xl border border-steel-100 px-3 py-2 transition hover:border-steel-300 hover:bg-steel-50">
                                {line}
                              </div>
                            )) : (
                              <div className="text-sm text-steel-500">No source text captured for this RFQ.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-steel-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                      <div className="section-title">Extraction Audit</div>
                      <div className="mt-4 grid gap-3">
                        <div className="rounded-2xl border border-steel-200 bg-[#f9fbfd] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Extracted items</div>
                          <div className="mt-1 text-2xl font-semibold text-steel-950">{extractedItemsCount}</div>
                        </div>
                        <div className="rounded-2xl border border-steel-200 bg-white px-4 py-3 text-sm text-steel-700">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Ambiguous lines</div>
                          <div className="mt-2">Not captured in this session yet.</div>
                        </div>
                        <div className="rounded-2xl border border-steel-200 bg-white px-4 py-3 text-sm text-steel-700">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Ignored lines</div>
                          <div className="mt-2">Not captured in this session yet.</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-steel-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                      <div className="section-title">Workflows</div>
                      <div className="mt-3 space-y-2">
                        {visibleSessions.length ? visibleSessions.map((session) => (
                          <button
                            key={session.id}
                            className={activeSession?.id === session.id
                              ? "w-full rounded-2xl border border-steel-400 bg-steel-50 px-3 py-3 text-left"
                              : "w-full rounded-2xl border border-steel-200 bg-white px-3 py-3 text-left transition hover:border-steel-300 hover:bg-steel-50"}
                            onClick={() => selectSession(session.id)}
                          >
                            <div className="font-medium text-steel-900">{session.title}</div>
                            <div className="mt-1 text-xs text-steel-600">{session.intakeSourceLabel || session.buyerEmail || "Unlabeled intake"}</div>
                            <div className="mt-2 text-[11px] uppercase tracking-[0.12em] text-steel-500">{formatTime(session.updatedAt)}</div>
                          </button>
                        )) : (
                          <div className="text-sm text-steel-500">No quote workflows yet.</div>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="rounded-[24px] border border-steel-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="section-title">Parsed Items</div>
                          <div className="mt-1 text-xl font-semibold text-steel-950">
                            {workspaceRows.length ? `${workspaceRows.length} items extracted` : "No extracted items yet"}
                          </div>
                          <div className="mt-1 text-sm text-steel-600">
                            Review the extracted scope before comparing inventory or sending the quote.
                          </div>
                        </div>
                        <div className="rounded-full border border-steel-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-steel-600">
                          {parseReady ? "Parsed" : "Pending"}
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {workspaceRows.length ? workspaceRows.map((row, index) => (
                          <details
                            key={row.id}
                            className="group rounded-[22px] border border-steel-200 bg-white px-4 py-3 transition hover:border-steel-300 hover:bg-steel-50"
                          >
                            <summary className="cursor-pointer list-none">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Line {index + 1}</div>
                                  <div className="mt-1 text-base font-semibold text-steel-950">{row.requestedLabel}</div>
                                  <div className="mt-1 text-sm text-steel-600">{row.quantity}</div>
                                </div>
                                <div className={`rounded-full border border-steel-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${stockStatusTextTone[row.stockStatus]}`}>
                                  {stockLabel(row.stockStatus)}
                                </div>
                              </div>
                            </summary>
                            <div className="mt-4 space-y-3 border-t border-steel-100 pt-4">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Normalized specs</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(row.requestedSpecs && row.requestedSpecs !== "Awaiting parse" ? row.requestedSpecs.split(" | ") : ["Awaiting parse"])
                                    .filter(Boolean)
                                    .map((spec) => (
                                      <span key={spec} className="rounded-full border border-steel-200 bg-white px-3 py-1 text-xs text-steel-700">
                                        {spec}
                                      </span>
                                    ))}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-steel-200 bg-[#f9fbfd] px-4 py-3 text-sm text-steel-700">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Source text used for extraction</div>
                                <div className="mt-2 leading-6">{row.requestedLine?.sourceText || row.requestedLine?.rawSpec || row.requestedLabel}</div>
                              </div>
                            </div>
                          </details>
                        )) : (
                          <div className="rounded-[22px] border border-dashed border-steel-300 bg-[#fbfcfd] px-4 py-10 text-center text-sm text-steel-500">
                            The parsed line items will appear here after you select a valid RFQ source.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-steel-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                      <div className="section-title">System Notes</div>
                      <div className="mt-3 grid gap-3">
                        <div className="rounded-2xl border border-steel-200 bg-[#f9fbfd] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Latest note</div>
                          <div className="mt-2 text-sm leading-6 text-steel-800">
                            {latestAssistantMessage?.content || "The system summary will appear here after parsing and matching complete."}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-steel-200 bg-white px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Operator instruction</div>
                          <textarea
                            className="input mt-3 min-h-24"
                            placeholder="Adjust tone, change lead time, remove lines, or leave an instruction for the quote agent."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button className="btn" disabled={busy || !input.trim()} onClick={() => void sendCommand(input)}>
                              {busy ? "Working..." : "Apply Instruction"}
                            </button>
                            <button className="btn-secondary" disabled={!activeSession || busy} onClick={() => void sendCommand("Don't include the out-of-stock items.")}>
                              Remove Out-Of-Stock
                            </button>
                          </div>
                          {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
                          {!error && info && <div className="mt-3 text-sm text-teal-700">{info}</div>}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="rounded-[24px] border border-steel-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="section-title">Inventory + Pricing</div>
                          <div className="mt-1 text-xl font-semibold text-steel-950">
                            {quoteCard?.type === "quote_preview" ? money(quoteCard.total) : "Quote total pending"}
                          </div>
                        </div>
                        <div className="rounded-full border border-steel-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-steel-600">
                          {draftReady ? "Draft ready" : "Draft pending"}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-steel-200 bg-white px-3 py-3 text-center text-sm text-steel-700 transition hover:border-steel-300 hover:bg-steel-50">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">In stock</div>
                          <div className="mt-1 text-xl font-semibold text-steel-950">{capabilitySummary.green}</div>
                        </div>
                        <div className="rounded-2xl border border-steel-200 bg-white px-3 py-3 text-center text-sm text-steel-700 transition hover:border-steel-300 hover:bg-steel-50">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Partial</div>
                          <div className="mt-1 text-xl font-semibold text-steel-950">{capabilitySummary.yellow}</div>
                        </div>
                        <div className="rounded-2xl border border-steel-200 bg-white px-3 py-3 text-center text-sm text-steel-700 transition hover:border-steel-300 hover:bg-steel-50">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-steel-500">Out</div>
                          <div className="mt-1 text-xl font-semibold text-steel-950">{capabilitySummary.red}</div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-steel-200 bg-[#f9fbfd] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Margin</div>
                            <div className="mt-1 text-lg font-semibold text-steel-950">{pendingMargin}%</div>
                          </div>
                          <button className="btn-secondary" disabled={!activeSession || busy} onClick={() => void runSessionAction("update_margin", { marginPercent: pendingMargin })}>
                            Apply
                          </button>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={40}
                          value={pendingMargin}
                          className="mt-4 w-full"
                          disabled={!activeSession || busy}
                          onChange={(e) => setPendingMargin(Number(e.target.value))}
                        />
                      </div>

                      <div className="mt-4 space-y-3">
                        {workspaceRows.length ? workspaceRows.map((row, index) => (
                          <div key={row.id} className="rounded-[22px] border border-steel-200 bg-white px-4 py-4 transition hover:border-steel-300 hover:bg-steel-50">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Line {index + 1}</div>
                                <div className="mt-1 text-sm font-semibold text-steel-950">{row.requestedLabel}</div>
                              </div>
                              <div className={`rounded-full border border-steel-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${stockStatusTextTone[row.stockStatus]}`}>
                                {stockLabel(row.stockStatus)}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-steel-700">
                              <div className="rounded-2xl border border-steel-200 bg-[#f9fbfd] px-3 py-3">
                                {row.match?.inventoryItem ? (
                                  <>
                                    <div className="font-medium text-steel-900">{row.match.inventoryItem.specText || row.match.inventoryItem.sku}</div>
                                    <div className="mt-1 text-xs text-steel-500">SKU {row.match.inventoryItem.sku}</div>
                                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-steel-600">
                                      <span>On hand {row.match.inventoryItem.qtyOnHand}</span>
                                      <span>{row.score} match</span>
                                      <span>{row.unitPrice}</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-sm text-steel-600">No inventory match found for this line.</div>
                                )}
                              </div>
                              <div className="rounded-2xl border border-steel-200 bg-white px-3 py-3 text-sm text-steel-600">
                                {stockActionCopy[row.stockStatus]}
                              </div>
                              {(row.stockStatus === "yellow" || row.stockStatus === "red") && row.requestedLine && onSourceLine ? (
                                <button
                                  className="btn-secondary w-full"
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
                                  {row.stockStatus === "red" ? "Create Sourcing Request" : "Source Shortage"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )) : null}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-steel-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                      <div className="section-title">Quote Draft</div>
                      <div className="mt-3 rounded-2xl border border-steel-200 bg-[#f9fbfd] px-4 py-3">
                        <div className="text-sm font-semibold text-steel-900">
                          {quoteCard?.type === "quote_preview" ? quoteCard.draftSubject : "No draft subject yet"}
                        </div>
                        <div className="mt-1 text-xs text-steel-500">
                          {activeSession.savedAt ? `Saved ${formatTime(activeSession.savedAt)}` : "Not saved yet"}
                        </div>
                      </div>
                      {(showQuotePreview || !quoteCard?.type) && (
                        <div className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-2xl border border-steel-200 bg-white px-4 py-3 text-xs leading-5 text-steel-600">
                          {quoteCard?.type === "quote_preview"
                            ? quoteCard.draftBody
                            : "When the draft is ready, the outbound quote preview will appear here."}
                        </div>
                      )}
                      <button className="btn-secondary mt-3 w-full" onClick={() => setShowQuotePreview((value) => !value)}>
                        {showQuotePreview ? "Hide Quote Preview" : "Preview Quote"}
                      </button>

                      <div className="mt-4 grid gap-3">
                        <div className="rounded-2xl border border-steel-200 bg-white px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Review status</div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-steel-700">
                            <span>Parsed</span>
                            <span className="text-right font-medium text-steel-900">{parseReady ? "Yes" : "No"}</span>
                            <span>Draft ready</span>
                            <span className="text-right font-medium text-steel-900">{draftReady ? "Yes" : "No"}</span>
                            <span>Approval</span>
                            <span className="text-right font-medium text-steel-900">{activeSession.approval?.status || "n/a"}</span>
                            <span>Exceptions</span>
                            <span className="text-right font-medium text-steel-900">{riskCards.length || 0}</span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-steel-200 bg-white px-4 py-3 text-sm text-steel-700">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Exceptions</div>
                          <div className="mt-2">{riskCards.length ? riskCards.map((card) => card.title).join(", ") : "No open exceptions"}</div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-20 border-t border-steel-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(245,248,251,0.98))] px-5 py-4 backdrop-blur">
            <div className="mx-auto flex max-w-[1580px] flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-steel-600">
                {activeSession
                  ? `${workspaceRows.length} items · ${shortageCount} shortage${shortageCount === 1 ? "" : "s"} · last updated ${formatTime(activeSession.updatedAt)}`
                  : "No active quote session"}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" disabled={!activeSession} onClick={() => setShowQuotePreview((value) => !value)}>
                  {showQuotePreview ? "Hide Preview" : "Preview Quote"}
                </button>
                <button className="btn-secondary" disabled={!activeSession || busy} onClick={() => void runSessionAction("save")}>
                  Save Draft
                </button>
                <button
                  className="btn-secondary"
                  disabled={!firstShortageRow || !onSourceLine}
                  onClick={() => {
                    if (!firstShortageRow?.requestedLine || !onSourceLine) return;
                    onSourceLine({
                      key: `${activeSession?.id || "quote"}-${firstShortageRow.id}`,
                      sourceContext: "quote_shortage",
                      reason: firstShortageRow.stockStatus === "red" ? "out_of_stock" : "low_stock",
                      sku: firstShortageRow.match?.inventoryItem?.sku,
                      productType: firstShortageRow.requestedLine.category || "Unknown",
                      grade: firstShortageRow.requestedLine.grade || "Unknown",
                      dimension: firstShortageRow.requestedLine.dimensionSummary || firstShortageRow.requestedLine.rawSpec,
                      quantity: firstShortageRow.requestedQuantityValue,
                      unit: firstShortageRow.requestedQuantityUnit,
                      requestedLength: firstShortageRow.requestedLine.length
                    });
                  }}
                >
                  Create Sourcing Request
                </button>
                {approvalPending && (
                  <button className="btn-secondary" disabled={busy} onClick={() => setApprovalModal(activeSession?.approval || null)}>
                    Review Approval
                  </button>
                )}
                <button className="btn" disabled={!approvalPending || busy} onClick={() => setApprovalModal(activeSession?.approval || null)}>
                  {sendButtonLabel}
                </button>
                <button className="btn-ghost" disabled={!activeSession || busy} onClick={() => void discardWorkflow()}>
                  Discard
                </button>
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
