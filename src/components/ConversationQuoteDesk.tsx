"use client";

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

  return (
    <>
      <div className="space-y-4">
        <div className="panel-industrial flex min-h-[760px] flex-col gap-4 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="section-title">Quote Desk</div>
              <h3 className="font-['Sora'] text-3xl font-semibold tracking-[-0.04em] text-steel-950">Parse, review, approve</h3>
              <p className="mt-2 max-w-2xl text-sm text-steel-600">
                Select an RFQ, review the matched inventory, then approve and send.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={startNewWorkflow}
              >
                New Workflow
              </button>
              <button className="btn-secondary" onClick={onSelectItemsToBid}>
                Select Items To Bid
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
                      : "Select items to bid to start a review."}
                  </div>
                  {activeSession?.intakeSourceLabel ? (
                    <div className="mt-1 text-xs uppercase tracking-[0.12em] text-steel-500">
                      Source: {activeSession.intakeSourceLabel}
                    </div>
                  ) : null}
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
                <button className="btn w-full" onClick={onSelectItemsToBid}>
                  Select items to bid
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
                  <div className="mt-2 text-sm text-steel-600">Select items from Buyers, paste a forwarded RFQ email, or upload RFQ files to populate the workspace.</div>
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
                        {activeSession?.intakeSourceType && activeSession.intakeSourceType !== "buyer_message" ? (
                          <div className="mt-2 text-[11px] uppercase tracking-[0.12em] text-steel-500">
                            {activeSession.intakeSourceType === "pasted_email"
                              ? "Manual pasted intake"
                              : activeSession.intakeSourceType === "uploaded_files"
                                ? "Uploaded file intake"
                                : "Manual intake"}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-steel-200 bg-white px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Parsed request</div>
                        <div className="mt-2 space-y-2">
                          {requestPreviewLines.length ? requestPreviewLines.map((line) => (
                            <div key={line.id} className="rounded-xl border border-steel-100 px-3 py-2 text-sm text-steel-700">
                              <div>{line.label}</div>
                              {line.meta ? <div className="mt-1 text-xs text-steel-500">{line.meta}</div> : null}
                            </div>
                          )) : (
                            <div className="text-sm text-steel-600">Select items to bid or upload an RFQ file to load the request.</div>
                          )}
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
                      <div className="rounded-full border border-steel-200 bg-white px-3 py-1.5 text-sm font-medium text-steel-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900">
                        In stock {capabilitySummary.green}
                      </div>
                      <div className="rounded-full border border-steel-200 bg-white px-3 py-1.5 text-sm font-medium text-steel-700 transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-900">
                        Partial {capabilitySummary.yellow}
                      </div>
                      <div className="rounded-full border border-steel-200 bg-white px-3 py-1.5 text-sm font-medium text-steel-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-900">
                        Out {capabilitySummary.red}
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      {workspaceRows.length ? workspaceRows.map((row) => (
                        <div key={row.id} className="group rounded-[18px] border border-steel-200 bg-white px-4 py-3 transition hover:border-steel-300 hover:bg-steel-50/40">
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_160px] lg:items-center">
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Requested item</div>
                              <div className="mt-1 text-base font-semibold text-steel-950">{row.requestedLabel}</div>
                              <div className="mt-1 text-sm text-steel-600">{row.quantity}</div>
                              {row.requestedSpecs && row.requestedSpecs !== "Awaiting parse" ? (
                                <div className="mt-1 text-xs leading-5 text-steel-500">{row.requestedSpecs}</div>
                              ) : null}
                            </div>

                            <div className="rounded-2xl border border-steel-200 bg-white px-4 py-3 transition group-hover:border-steel-300">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Inventory match</div>
                                <div className={`rounded-full border border-steel-200 px-2.5 py-1 text-[11px] font-semibold text-steel-600 transition group-hover:border-current ${stockStatusTextTone[row.stockStatus]}`}>
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
                              <div className="rounded-2xl border border-steel-200 px-3 py-2 text-sm text-steel-600 transition group-hover:border-steel-300">
                                {stockActionCopy[row.stockStatus]}
                              </div>
                              {(row.stockStatus === "yellow" || row.stockStatus === "red") && row.requestedLine && onSourceLine ? (
                                <button
                                  className="rounded-2xl border border-steel-200 bg-white px-3 py-2 text-sm font-semibold text-steel-800 transition hover:border-steel-300 hover:bg-steel-100"
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
                                <div className="rounded-2xl border border-steel-200 px-3 py-2 text-center text-sm font-medium text-steel-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900">
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
                    onClick={() => selectSession(session.id)}
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
