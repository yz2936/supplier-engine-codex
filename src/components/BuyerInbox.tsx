"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Buyer = {
  id: string;
  companyName: string;
  contactName?: string;
  email: string;
  status: "New" | "Active" | "Dormant";
  notes?: string;
  lastInteractionAt: string;
};

type BuyerMessage = {
  id: string;
  direction: "inbound" | "outbound";
  subject: string;
  bodyText: string;
  fromEmail: string;
  toEmail: string;
  receivedAt: string;
};

type MessageHighlight = {
  id: string;
  label: string;
  sourceText: string;
  quantity?: string;
  colorClass: string;
};

type MessageAnalysisState = {
  loading: boolean;
  items: MessageHighlight[];
};

type BuyerInboxProps = {
  onStartQuote?: (payload: { sourceMessageId: string; buyerName: string; buyerEmail: string; rfqText: string }) => Promise<void> | void;
};

const highlightPalette = [
  "border-sky-300 bg-sky-50/90",
  "border-amber-300 bg-amber-50/90",
  "border-emerald-300 bg-emerald-50/90",
  "border-fuchsia-300 bg-fuchsia-50/90"
];

const normalizeSnippet = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

const fallbackHighlights = (bodyText: string): MessageHighlight[] => {
  const lines = bodyText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\d/.test(line) && /(pipe|tube|conduit|valve|flange|elbow|tee|reducer|cap|coupling|gasket|sheet|plate|coil|bar|fitting)/i.test(line))
    .slice(0, 6);

  return lines.map((line, index) => ({
    id: `fallback-${index}`,
    label: line.length > 80 ? `${line.slice(0, 77)}...` : line,
    sourceText: line,
    colorClass: highlightPalette[index % highlightPalette.length]
  }));
};

const buildHighlights = (extracted: Array<{
  rawSpec?: string;
  sourceText?: string;
  quantity?: number;
  quantityUnit?: string;
  productType?: string;
  category?: string;
}>): MessageHighlight[] => {
  const items: MessageHighlight[] = [];
  extracted.forEach((item, index) => {
      const sourceText = String(item.sourceText || item.rawSpec || "").trim();
      const label = [item.productType, item.category].filter(Boolean).join(" ").trim() || sourceText;
      if (!sourceText || !label) return;
      items.push({
        id: `parsed-${index}`,
        label,
        sourceText,
        quantity: item.quantity ? `${item.quantity} ${item.quantityUnit || ""}`.trim() : undefined,
        colorClass: highlightPalette[index % highlightPalette.length]
      });
    });
  return items.slice(0, 8);
};

const matchHighlight = (line: string, items: MessageHighlight[]) => {
  const normalizedLine = normalizeSnippet(line);
  if (!normalizedLine) return null;
  return items.find((item) => {
    const normalizedSource = normalizeSnippet(item.sourceText);
    const normalizedLabel = normalizeSnippet(item.label);
    return (normalizedSource.length >= 8 && normalizedLine.includes(normalizedSource))
      || (normalizedLabel.length >= 6 && normalizedLine.includes(normalizedLabel));
  }) || null;
};

export function BuyerInbox({ onStartQuote }: BuyerInboxProps) {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>("");
  const [messages, setMessages] = useState<BuyerMessage[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Buyer["status"]>("New");
  const [info, setInfo] = useState("");
  const [quoteInfo, setQuoteInfo] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [analysisByMessageId, setAnalysisByMessageId] = useState<Record<string, MessageAnalysisState>>({});
  const syncInFlightRef = useRef(false);
  const analysisCacheRef = useRef<Record<string, MessageHighlight[]>>({});

  const selectedBuyer = buyers.find((b) => b.id === selectedBuyerId);

  const loadBuyers = useCallback(async () => {
    const res = await fetch("/api/buyers", { credentials: "include", cache: "no-store" });
    const json = await res.json();
    if (res.ok) {
      setBuyers(json.buyers || []);
      if (!selectedBuyerId && json.buyers?.[0]?.id) {
        setSelectedBuyerId(json.buyers[0].id);
      }
    }
  }, [selectedBuyerId]);

  const loadMessages = useCallback(async (buyerId: string) => {
    const res = await fetch(`/api/buyers/${buyerId}/messages`, { credentials: "include", cache: "no-store" });
    const json = await res.json();
    if (res.ok) {
      setMessages(json.messages || []);
      setNotes(json.buyer?.notes || "");
      setStatus(json.buyer?.status || "New");
    }
  }, []);

  const syncInbound = useCallback(async (silent?: boolean) => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncing(true);
    if (!silent) setInfo("Syncing inbound mailbox...");
    try {
      const res = await fetch("/api/email/inbound/sync", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 30 })
      });
      const json = await res.json();
      if (!res.ok) {
        setInfo(json.error || "Sync failed");
      } else {
        if (!silent) setInfo(`Synced: ${json.created} new, ${json.scanned} scanned`);
        await loadBuyers();
        if (selectedBuyerId) await loadMessages(selectedBuyerId);
      }
    } catch (err) {
      if (!silent) setInfo(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
      syncInFlightRef.current = false;
    }
  }, [loadBuyers, loadMessages, selectedBuyerId]);

  useEffect(() => {
    loadBuyers();
  }, [loadBuyers]);

  useEffect(() => {
    if (selectedBuyerId) loadMessages(selectedBuyerId);
  }, [selectedBuyerId, loadMessages]);

  useEffect(() => {
    let cancelled = false;

    const analyzeMessages = async () => {
      const inboundMessages = messages.filter((message) => message.direction === "inbound").slice(0, 10);
      for (const message of inboundMessages) {
        if (analysisCacheRef.current[message.id]) continue;

        setAnalysisByMessageId((prev) => ({
          ...prev,
          [message.id]: {
            loading: true,
            items: prev[message.id]?.items || []
          }
        }));

        try {
          const res = await fetch("/api/parse", {
            credentials: "include",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message.bodyText, marginPercent: 12 })
          });
          const json = await res.json().catch(() => ({} as { extracted?: Array<{
            rawSpec?: string;
            sourceText?: string;
            quantity?: number;
            quantityUnit?: string;
            productType?: string;
            category?: string;
          }> }));
          const nextItems = res.ok
            ? buildHighlights(json.extracted || [])
            : fallbackHighlights(message.bodyText);
          const finalItems = nextItems.length ? nextItems : fallbackHighlights(message.bodyText);
          analysisCacheRef.current[message.id] = finalItems;
          if (!cancelled) {
            setAnalysisByMessageId((prev) => ({
              ...prev,
              [message.id]: {
                loading: false,
                items: finalItems
              }
            }));
          }
        } catch {
          const fallback = fallbackHighlights(message.bodyText);
          analysisCacheRef.current[message.id] = fallback;
          if (!cancelled) {
            setAnalysisByMessageId((prev) => ({
              ...prev,
              [message.id]: {
                loading: false,
                items: fallback
              }
            }));
          }
        }
      }
    };

    void analyzeMessages();

    return () => {
      cancelled = true;
    };
  }, [messages]);

  useEffect(() => {
    syncInbound(true);
    const id = setInterval(() => {
      syncInbound(true);
    }, 180000);
    return () => clearInterval(id);
  }, [syncInbound]);

  const displayedMessages = messages;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="panel panel-aurora space-y-3 overflow-hidden">
        <div className="space-y-2">
          <div className="font-semibold">Buyer Profiles</div>
          <div className="grid grid-cols-1 gap-2">
            <button
              className="btn-secondary w-full"
              disabled={syncing}
              onClick={async () => {
                await syncInbound(false);
              }}
            >
              {syncing ? "Syncing..." : "Sync Inbound Mail"}
            </button>
          </div>
        </div>
        <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
          {buyers.map((b) => (
            <button
              key={b.id}
              className={selectedBuyerId === b.id
                ? "w-full rounded-2xl border border-steel-500 bg-steel-50 p-3 text-left"
                : "w-full rounded-2xl border border-steel-200 bg-white/80 p-3 text-left"}
              onClick={() => setSelectedBuyerId(b.id)}
            >
              <div className="truncate font-medium">{b.companyName}</div>
              <div className="truncate text-xs text-steel-700">{b.contactName || "Buyer Contact"} · {b.email}</div>
              <div className="text-xs text-steel-600">{b.status} · {new Date(b.lastInteractionAt).toLocaleString()}</div>
            </button>
          ))}
          {!buyers.length && <div className="text-sm text-steel-700">No routed buyers yet.</div>}
        </div>
        {info && <div className="text-xs text-steel-700">{info}</div>}
      </div>

      <div className="min-w-0 space-y-4">
        <div className="panel panel-aurora space-y-3 overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-steel-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="font-semibold">Buyer Conversation</div>
              <div className="text-xs text-steel-600">Review routed emails and open quoting directly from the thread.</div>
            </div>
          </div>
          {selectedBuyer ? (
            <>
              <div className="grid gap-2 rounded-2xl border border-steel-200/80 bg-white/75 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 text-sm text-steel-700">
                  <div className="truncate font-medium text-steel-900">{selectedBuyer.companyName}</div>
                  <div className="truncate">{selectedBuyer.email}</div>
                </div>
                <div className="rounded-full border border-steel-200 bg-white px-3 py-1 text-xs text-steel-600">
                  All routed messages
                </div>
              </div>
              <div className="max-h-[560px] space-y-2 overflow-auto rounded-2xl border border-steel-200 bg-steel-50/80 p-2">
                {displayedMessages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.direction === "inbound"
                        ? "rounded border border-emerald-200 bg-emerald-50 p-3"
                        : "rounded border border-slate-200 bg-white p-2"
                    }
                  >
                    {(() => {
                      const analysis = analysisByMessageId[m.id];
                      const lines = m.bodyText.split("\n");

                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-medium">{m.direction.toUpperCase()} · {new Date(m.receivedAt).toLocaleString()}</div>
                          </div>
                          <div className="break-words text-xs text-steel-700">{m.subject}</div>

                          {m.direction === "inbound" && (
                            <div className="mt-3 space-y-2">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Detected Product Requests</div>
                              {analysis?.loading ? (
                                <div className="text-xs text-steel-500">Identifying potential product requests...</div>
                              ) : analysis?.items?.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {analysis.items.map((item) => (
                                    <div key={item.id} className={`rounded-full border px-3 py-1 text-xs font-medium text-steel-800 ${item.colorClass}`}>
                                      {item.label}
                                      {item.quantity ? ` · ${item.quantity}` : ""}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-steel-500">No distinct product sections detected yet. You can still quote from the full email.</div>
                              )}
                            </div>
                          )}

                          <div className="mt-3 rounded-2xl border border-white/60 bg-white/80 p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">Email Body</div>
                            <div className="mt-2 space-y-1">
                              {lines.map((line, index) => {
                                const highlight = m.direction === "inbound" ? matchHighlight(line, analysis?.items || []) : null;
                                if (!line.trim()) {
                                  return <div key={`${m.id}-line-${index}`} className="h-2" />;
                                }

                                if (!highlight) {
                                  return (
                                    <div key={`${m.id}-line-${index}`} className="whitespace-pre-wrap px-1 py-1 text-sm text-steel-800">
                                      {line}
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={`${m.id}-line-${index}`}
                                    className={`group relative rounded-xl border px-3 py-2 transition ${highlight.colorClass}`}
                                  >
                                    <div className="pr-28 whitespace-pre-wrap text-sm font-medium text-steel-900">{line}</div>
                                    {onStartQuote && (
                                      <button
                                        className="absolute right-2 top-2 rounded-full border border-white/80 bg-white/95 px-3 py-1 text-[11px] font-semibold text-steel-800 opacity-0 shadow-sm transition group-hover:opacity-100"
                                        onClick={async () => {
                                          setQuoteInfo("Opening quote workflow...");
                                          try {
                                            await onStartQuote({
                                              sourceMessageId: m.id,
                                              buyerName: selectedBuyer.companyName,
                                              buyerEmail: selectedBuyer.email,
                                              rfqText: highlight.sourceText || line
                                            });
                                            setQuoteInfo("Quote workflow opened from highlighted product request.");
                                          } catch (err) {
                                            setQuoteInfo(err instanceof Error ? err.message : "Failed to open quote workflow");
                                          }
                                        }}
                                      >
                                        Start Quote
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                    {m.direction === "inbound" && onStartQuote && (
                      <button
                        className="btn-secondary mt-2"
                        onClick={async () => {
                          setQuoteInfo("Opening quote workflow...");
                          try {
                            await onStartQuote({
                              sourceMessageId: m.id,
                              buyerName: selectedBuyer.companyName,
                              buyerEmail: selectedBuyer.email,
                              rfqText: m.bodyText
                            });
                            setQuoteInfo("Quote workflow opened from inbound request.");
                          } catch (err) {
                            setQuoteInfo(err instanceof Error ? err.message : "Failed to open quote workflow");
                          }
                        }}
                      >
                        Start Quote From This Message
                      </button>
                    )}
                  </div>
                ))}
                {!displayedMessages.length && <div className="text-sm text-steel-700">No messages match the current filter.</div>}
              </div>
              {quoteInfo && <div className="text-xs text-steel-700">{quoteInfo}</div>}
            </>
          ) : (
            <div className="text-sm text-steel-700">Select a buyer profile.</div>
          )}
        </div>

        {selectedBuyer && (
          <div className="panel panel-aurora space-y-3 overflow-hidden">
            <div className="font-semibold">Manager Notes</div>
            <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Buyer["status"])}>
                <option>New</option>
                <option>Active</option>
                <option>Dormant</option>
              </select>
              <textarea className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Buyer notes" />
            </div>
            <button
              className="btn w-full md:w-auto"
              onClick={async () => {
                setInfo("Saving...");
                const res = await fetch(`/api/buyers/${selectedBuyer.id}`, {
                  credentials: "include",
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ notes, status })
                });
                const json = await res.json();
                setInfo(res.ok ? "Saved" : json.error || "Failed");
                if (res.ok) loadBuyers();
              }}
            >
              Save Profile Update
            </button>
            {info && <div className="text-xs text-steel-700">{info}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
