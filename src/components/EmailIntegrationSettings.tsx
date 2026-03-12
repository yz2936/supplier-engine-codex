"use client";

import { useEffect, useState } from "react";

type RoutingSettingsResponse = {
  forwarding?: {
    address?: string;
    routingAddress?: string;
    webhookPath?: string;
    secretRequired?: boolean;
  } | null;
};

export function EmailIntegrationSettings() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [proxyAddress, setProxyAddress] = useState("");
  const [routingAddress, setRoutingAddress] = useState("");
  const [webhookPath, setWebhookPath] = useState("/api/email/inbound");
  const [secretRequired, setSecretRequired] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setStatus("");
      try {
        const res = await fetch("/api/email/account", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({} as { forwarding?: RoutingSettingsResponse["forwarding"]; error?: string }));
        if (!res.ok) throw new Error(json.error || "Failed to load routing settings");
        setProxyAddress(json.forwarding?.address || "");
        setRoutingAddress(json.forwarding?.routingAddress || "");
        setWebhookPath(json.forwarding?.webhookPath || "/api/email/inbound");
        setSecretRequired(Boolean(json.forwarding?.secretRequired));
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Failed to load routing settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const runRoutingSync = async () => {
    setSyncing(true);
    setSyncStatus("Syncing routed inbox...");
    try {
      const res = await fetch("/api/email/inbound/sync", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 30, routingMode: true })
      });
      const json = await res.json().catch(() => ({} as { error?: string; created?: number; scanned?: number; skipped?: number }));
      if (!res.ok) throw new Error(json.error || "Routed inbox sync failed");
      setSyncStatus(`Routed inbox sync complete: ${json.created ?? 0} new, ${json.scanned ?? 0} scanned, ${json.skipped ?? 0} skipped.`);
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : "Routed inbox sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="panel panel-aurora space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="section-title">Email Routing</div>
          <div className="font-semibold text-steel-900">Forward Any Quote Email Into The Tool</div>
        </div>
      </div>

      <p className="text-xs text-steel-600">
        Direct mailbox login has been removed from the operator workflow. Forward RFQ or buyer quote emails into the routing inbox, sync the routed inbox, then parse from Buyers or Quote Desk.
      </p>

      {loading ? (
        <div className="text-xs text-steel-600">Loading routing settings...</div>
      ) : (
        <>
          <div className="rounded-2xl border border-steel-200/70 bg-white/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-steel-500">Your Route Address</div>
            <div className="mt-2 break-all text-lg font-semibold text-steel-950">
              {routingAddress || "Routing address is not configured yet."}
            </div>
            <div className="mt-3 text-xs text-steel-600">
              Shared proxy inbox: {proxyAddress || "INBOUND_ROUTE_ADDRESS is not configured."}
            </div>
            <div className="mt-2 text-xs text-steel-600">
              Intake endpoint: `{webhookPath}`.{secretRequired ? " A webhook secret is enabled on the server." : ""}
            </div>
          </div>

          <div className="rounded-2xl border border-steel-200/70 bg-white/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-steel-500">How To Use It</div>
            <div className="mt-3 space-y-2 text-sm text-steel-700">
              <div>1. In your external mailbox, create a forwarding rule for RFQ, quote, or buyer-request emails.</div>
              <div>2. Forward those emails to your route address shown above, not to your personal login email.</div>
              <div>3. Back in this tool, click `Use Routed Inbox` once to ignore broken custom mailbox settings.</div>
              <div>4. Click `Sync Routed Emails` to pull the forwarded messages into the Buyers inbox.</div>
              <div>5. Open `Buyers` or `Quote Desk` and start the quote from the routed email.</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-secondary"
              disabled={resetting || syncing}
              onClick={async () => {
                setResetting(true);
                setStatus("Clearing custom mailbox settings...");
                try {
                  const res = await fetch("/api/email/account", {
                    credentials: "include",
                    method: "DELETE"
                  });
                  const json = await res.json().catch(() => ({} as { error?: string; message?: string }));
                  if (!res.ok) throw new Error(json.error || "Failed to switch to routed inbox");
                  setStatus(json.message || "Custom mailbox settings cleared. Routed inbox mode is active.");
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Failed to switch to routed inbox");
                } finally {
                  setResetting(false);
                }
              }}
            >
              {resetting ? "Switching..." : "Use Routed Inbox"}
            </button>
            <button
              className="btn"
              disabled={syncing || resetting}
              onClick={() => void runRoutingSync()}
            >
              {syncing ? "Syncing..." : "Sync Routed Emails"}
            </button>
          </div>
        </>
      )}

      {status && <div className="text-xs text-steel-700">{status}</div>}
      {syncStatus && <div className="text-xs text-steel-700">{syncStatus}</div>}
    </div>
  );
}
