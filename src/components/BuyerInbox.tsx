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

type BuyerInboxProps = {
  onStartQuote?: (payload: { sourceMessageId: string; buyerName: string; buyerEmail: string; rfqText: string }) => Promise<void> | void;
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
  const syncInFlightRef = useRef(false);

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
                        ? "rounded border border-emerald-200 bg-emerald-50 p-2"
                        : "rounded border border-slate-200 bg-white p-2"
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium">{m.direction.toUpperCase()} · {new Date(m.receivedAt).toLocaleString()}</div>
                    </div>
                    <div className="break-words text-xs text-steel-700">{m.subject}</div>
                    <div className="mt-1 max-w-full whitespace-pre-wrap break-words text-sm text-steel-800">{m.bodyText}</div>
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
