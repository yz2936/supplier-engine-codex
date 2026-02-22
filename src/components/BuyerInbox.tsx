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
  onStartQuote?: (payload: { buyerName: string; buyerEmail: string; rfqText: string }) => Promise<void> | void;
};

export function BuyerInbox({ onStartQuote }: BuyerInboxProps) {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>("");
  const [messages, setMessages] = useState<BuyerMessage[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Buyer["status"]>("New");
  const [info, setInfo] = useState("");
  const [filterInfo, setFilterInfo] = useState("");
  const [quoteInfo, setQuoteInfo] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [procurementOnly, setProcurementOnly] = useState(false);
  const [filteringMessages, setFilteringMessages] = useState(false);
  const [acceptedInboundIds, setAcceptedInboundIds] = useState<string[]>([]);
  const [manualFilterInfo, setManualFilterInfo] = useState("");
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
        const mode = json.filter?.enabled ? `AI filter ON (${json.filter?.model || "gpt-4o-mini"})` : "AI filter OFF";
        setFilterInfo(`${mode}. Non-procurement inbound emails are suppressed.`);
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
    setProcurementOnly(false);
    setAcceptedInboundIds([]);
    setManualFilterInfo("");
  }, [selectedBuyerId, loadMessages]);

  useEffect(() => {
    syncInbound(true);
    const id = setInterval(() => {
      syncInbound(true);
    }, 180000);
    return () => clearInterval(id);
  }, [syncInbound]);

  const applyProcurementFilter = useCallback(async () => {
    if (!selectedBuyerId) return;
    setFilteringMessages(true);
    setManualFilterInfo("Applying procurement filter...");
    try {
      const res = await fetch(`/api/buyers/${selectedBuyerId}/messages/filter`, {
        credentials: "include",
        method: "POST"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to filter messages");
      setAcceptedInboundIds(json.acceptedInboundIds || []);
      setProcurementOnly(true);
      const stats = json.stats || {};
      setManualFilterInfo(`Filter applied: ${stats.inboundAccepted ?? 0}/${stats.inboundTotal ?? 0} inbound messages kept.`);
    } catch (err) {
      setManualFilterInfo(err instanceof Error ? err.message : "Failed to filter messages");
    } finally {
      setFilteringMessages(false);
    }
  }, [selectedBuyerId]);

  const displayedMessages = procurementOnly
    ? messages.filter((m) => m.direction === "outbound" || acceptedInboundIds.includes(m.id))
    : messages;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <div className="panel panel-aurora space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Buyer Profiles</div>
          <button
            className="btn-secondary"
            disabled={syncing}
            onClick={async () => {
              await syncInbound(false);
            }}
          >
            {syncing ? "Syncing..." : "Sync Inbound Mail"}
          </button>
        </div>
        {buyers.map((b) => (
          <button
            key={b.id}
            className={selectedBuyerId === b.id ? "w-full rounded border border-steel-500 bg-steel-50 p-2 text-left" : "w-full rounded border border-steel-200 p-2 text-left"}
            onClick={() => setSelectedBuyerId(b.id)}
          >
            <div className="font-medium">{b.companyName}</div>
            <div className="text-xs text-steel-700">{b.contactName || "Buyer Contact"} · {b.email}</div>
            <div className="text-xs text-steel-600">{b.status} · {new Date(b.lastInteractionAt).toLocaleString()}</div>
          </button>
        ))}
        {!buyers.length && <div className="text-sm text-steel-700">No routed buyers yet.</div>}
        {info && <div className="text-xs text-steel-700">{info}</div>}
        {filterInfo && <div className="text-xs text-steel-600">{filterInfo}</div>}
      </div>

      <div className="space-y-4">
        <div className="panel panel-aurora space-y-2">
          <div className="font-semibold">Buyer Conversation</div>
          {selectedBuyer ? (
            <>
              <div className="text-sm text-steel-700">{selectedBuyer.companyName} · {selectedBuyer.email}</div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" disabled={filteringMessages} onClick={() => void applyProcurementFilter()}>
                  {filteringMessages ? "Filtering..." : "Apply Procurement Filter"}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setProcurementOnly(false);
                    setAcceptedInboundIds([]);
                    setManualFilterInfo("");
                  }}
                >
                  Show All Messages
                </button>
              </div>
              <div className="max-h-72 space-y-2 overflow-auto rounded border border-steel-200 bg-steel-50 p-2">
                {displayedMessages.map((m) => (
                  <div key={m.id} className={m.direction === "inbound" ? "rounded border border-emerald-200 bg-emerald-50 p-2" : "rounded border border-slate-200 bg-white p-2"}>
                    <div className="text-xs font-medium">{m.direction.toUpperCase()} · {new Date(m.receivedAt).toLocaleString()}</div>
                    <div className="text-xs text-steel-700">{m.subject}</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{m.bodyText}</div>
                    {m.direction === "inbound" && onStartQuote && (
                      <button
                        className="btn-secondary mt-2"
                        onClick={async () => {
                          setQuoteInfo("Opening quote workspace...");
                          try {
                            await onStartQuote({
                              buyerName: selectedBuyer.companyName,
                              buyerEmail: selectedBuyer.email,
                              rfqText: m.bodyText
                            });
                            setQuoteInfo("Quote workspace prefilled from inbound request.");
                          } catch (err) {
                            setQuoteInfo(err instanceof Error ? err.message : "Failed to open quote workspace");
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
              {manualFilterInfo && <div className="text-xs text-steel-600">{manualFilterInfo}</div>}
            </>
          ) : (
            <div className="text-sm text-steel-700">Select a buyer profile.</div>
          )}
        </div>

        {selectedBuyer && (
          <div className="panel panel-aurora space-y-2">
            <div className="font-semibold">Manager Notes</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Buyer["status"])}>
              <option>New</option>
              <option>Active</option>
              <option>Dormant</option>
            </select>
            <textarea className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Buyer notes" />
            <button
              className="btn"
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
