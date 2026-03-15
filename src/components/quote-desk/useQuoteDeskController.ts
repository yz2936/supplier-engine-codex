"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { summarizeRequestedSpecs } from "@/lib/format";
import { extractTextFromRfqFile } from "@/lib/rfq-file";
import { QuoteAgentSession, QuoteApprovalRequest } from "@/lib/types";

const formatPreview = (value: string, max = 88) => value.length > max ? `${value.slice(0, max - 3)}...` : value;

type UseQuoteDeskControllerOptions = {
  requestedSession?: QuoteAgentSession | null;
};

export function useQuoteDeskController({ requestedSession }: UseQuoteDeskControllerOptions) {
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
    if (isNewWorkflow || !activeSessionId) return null;
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
          ? formatPreview(extractedLine.sourceText || extractedLine.rawSpec || [extractedLine.grade, extractedLine.category].filter(Boolean).join(" "))
          : formatPreview(quoteLine?.requested.sourceText || quoteLine?.requested.rawSpec || quoteLine?.description || "Unparsed item"),
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
        unitPrice: typeof quoteLine?.unitPrice === "number" ? `$${quoteLine.unitPrice.toFixed(2)}` : "Pending",
        extendedPrice: typeof quoteLine?.extendedPrice === "number" ? `$${quoteLine.extendedPrice.toFixed(2)}` : "Pending",
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

  const requestPreviewLines = useMemo(() => {
    if (extractionCard?.type === "rfq_extraction" && extractionCard.lineItems.length) {
      return extractionCard.lineItems.slice(0, 8).map((item, index) => ({
        id: `${index}-${item.rawSpec}`,
        label: formatPreview(item.sourceText || item.rawSpec, 120),
        meta: `${item.quantity} ${item.quantityUnit}`
      }));
    }

    const fallback = (activeSession?.rfqText || "").split("\n").map((line) => line.trim()).filter(Boolean);
    return fallback.slice(0, 8).map((line, index) => ({
      id: `${index}-${line}`,
      label: formatPreview(line, 120),
      meta: ""
    }));
  }, [activeSession?.rfqText, extractionCard]);

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
    setActiveSessionId((current) => json.sessions?.some((session: QuoteAgentSession) => session.id === current) ? current : "");
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
          subject: manualSubject.trim() || undefined,
          intakeSourceType: "pasted_email",
          intakeSourceLabel: manualSubject.trim() || `Pasted email from ${buyerEmail}`
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
          subject,
          intakeSourceType: "uploaded_files",
          intakeSourceLabel: subject
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
    } catch (err) {
      setApprovalModal(pendingApproval);
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  };

  const startNewWorkflow = () => {
    setIsNewWorkflow(true);
    setActiveSessionId("");
    setInput("");
    setError("");
    setInfo("");
    setApprovalModal(null);
  };

  const selectSession = (sessionId: string) => {
    setIsNewWorkflow(false);
    setActiveSessionId(sessionId);
  };

  const visibleSessions = useMemo(
    () => sessions.filter((session) => session.status !== "discarded"),
    [sessions]
  );

  const approvalPending = activeSession?.approval?.status === "pending";
  const draftReady = activeSession?.stage === "draft_ready" || activeSession?.stage === "awaiting_approval" || activeSession?.stage === "sent";
  const parseReady = Boolean(extractionCard?.type === "rfq_extraction");
  const sendButtonLabel = approvalPending
    ? "Approve & Send"
    : activeSession?.stage === "sent" || activeSession?.status === "completed"
      ? "Sent"
      : "Awaiting Approval";

  return {
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
    sessions,
    showManualIntake,
    visibleSessions,
    workspaceRows,
    approveSend,
    discardWorkflow,
    importForwardedEmail,
    importRfqFiles,
    runSessionAction,
    selectSession,
    sendCommand,
    setApprovalModal,
    setInput,
    setManualBody,
    setManualBuyerEmail,
    setManualBuyerName,
    setManualSubject,
    setPendingMargin,
    setShowManualIntake,
    startNewWorkflow
  };
}
