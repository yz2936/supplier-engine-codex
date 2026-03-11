"use client";

import { useEffect, useState } from "react";

type EmailSettingsResponse = {
  configured?: boolean;
  updatedAt?: string;
  inboundProtocol?: "imap" | "pop";
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from?: string;
  } | null;
  imap?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    rejectUnauthorized?: boolean;
  } | null;
  pop?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    rejectUnauthorized?: boolean;
  } | null;
};

export function EmailIntegrationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [useSmtpForImap, setUseSmtpForImap] = useState(true);
  const [inboundProtocol, setInboundProtocol] = useState<"imap" | "pop">("imap");
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [imapUser, setImapUser] = useState("");
  const [imapPass, setImapPass] = useState("");
  const [imapRejectUnauthorized, setImapRejectUnauthorized] = useState(true);
  const [popHost, setPopHost] = useState("");
  const [popPort, setPopPort] = useState(995);
  const [popSecure, setPopSecure] = useState(true);
  const [popUser, setPopUser] = useState("");
  const [popPass, setPopPass] = useState("");
  const [popRejectUnauthorized, setPopRejectUnauthorized] = useState(true);
  const [configuredAt, setConfiguredAt] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setStatus("");
      try {
        const res = await fetch("/api/email/account", { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({} as { settings?: EmailSettingsResponse; error?: string }));
        if (!res.ok) throw new Error(json.error || "Failed to load email settings");
        const settings = (json.settings || {}) as EmailSettingsResponse;
        setInboundProtocol(settings.inboundProtocol === "pop" ? "pop" : "imap");
        if (settings.smtp) {
          setSmtpHost(settings.smtp.host || "smtp.gmail.com");
          setSmtpPort(settings.smtp.port || 587);
          setSmtpSecure(Boolean(settings.smtp.secure));
          setSmtpUser(settings.smtp.user || "");
          setSmtpFrom(settings.smtp.from || "");
        }
        if (settings.imap) {
          setUseSmtpForImap(false);
          setImapHost(settings.imap.host || "imap.gmail.com");
          setImapPort(settings.imap.port || 993);
          setImapSecure(Boolean(settings.imap.secure));
          setImapUser(settings.imap.user || "");
          setImapRejectUnauthorized(settings.imap.rejectUnauthorized ?? true);
        }
        if (settings.pop) {
          setPopHost(settings.pop.host || "");
          setPopPort(settings.pop.port || 995);
          setPopSecure(Boolean(settings.pop.secure));
          setPopUser(settings.pop.user || "");
          setPopRejectUnauthorized(settings.pop.rejectUnauthorized ?? true);
        }
        if (settings.updatedAt) setConfiguredAt(settings.updatedAt);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Failed to load email settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const runInboundSync = async () => {
    setSyncing(true);
    setSyncStatus("Testing inbound mailbox...");
    try {
      const res = await fetch("/api/email/inbound/sync", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 30 })
      });
      const json = await res.json().catch(() => ({} as { error?: string; created?: number; scanned?: number; skipped?: number }));
      if (!res.ok) throw new Error(json.error || "Inbound sync failed");
      setSyncStatus(`Inbound sync complete: ${json.created ?? 0} new, ${json.scanned ?? 0} scanned, ${json.skipped ?? 0} skipped.`);
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : "Inbound sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="panel panel-aurora space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="section-title">Email Integration</div>
          <div className="font-semibold text-steel-900">Connect Your Mailbox</div>
        </div>
        {configuredAt && <div className="text-xs text-steel-600">Updated {new Date(configuredAt).toLocaleString()}</div>}
      </div>

      <p className="text-xs text-steel-600">
        Add your own SMTP account once. Inbound buyer sync can use either IMAP or POP to match how industrial mailboxes are configured in the real world.
      </p>

      {loading ? (
        <div className="text-xs text-steel-600">Loading settings...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input className="input" placeholder="SMTP host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            <input className="input" type="number" placeholder="SMTP port" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value || 587))} />
            <label className="flex items-center gap-2 rounded-xl border border-steel-200 bg-white/80 px-3 py-2">
              <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
              <span>SMTP secure (SSL/TLS)</span>
            </label>
            <input className="input" placeholder="SMTP login email" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
            <input className="input md:col-span-2" placeholder="SMTP app password (leave blank to keep existing)" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
            <input className="input md:col-span-2" placeholder="From address (optional)" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-xl border border-steel-200 bg-white/80 px-3 py-2">
              <span className="text-steel-700">Inbound protocol</span>
              <select className="input ml-auto max-w-[160px]" value={inboundProtocol} onChange={(e) => setInboundProtocol(e.target.value as "imap" | "pop")}>
                <option value="imap">IMAP</option>
                <option value="pop">POP</option>
              </select>
            </label>

            {inboundProtocol === "imap" && (
              <label className="flex items-center gap-2 rounded-xl border border-steel-200 bg-white/80 px-3 py-2">
                <input type="checkbox" checked={useSmtpForImap} onChange={(e) => setUseSmtpForImap(e.target.checked)} />
                <span>Use same account for inbound IMAP</span>
              </label>
            )}
          </div>

          {inboundProtocol === "imap" && !useSmtpForImap && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className="input" placeholder="IMAP host" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
              <input className="input" type="number" placeholder="IMAP port" value={imapPort} onChange={(e) => setImapPort(Number(e.target.value || 993))} />
              <label className="flex items-center gap-2 rounded-xl border border-steel-200 bg-white/80 px-3 py-2">
                <input type="checkbox" checked={imapSecure} onChange={(e) => setImapSecure(e.target.checked)} />
                <span>IMAP secure (SSL/TLS)</span>
              </label>
              <input className="input" placeholder="IMAP login email" value={imapUser} onChange={(e) => setImapUser(e.target.value)} />
              <input className="input md:col-span-2" placeholder="IMAP app password (leave blank to keep existing)" type="password" value={imapPass} onChange={(e) => setImapPass(e.target.value)} />
              <label className="flex items-center gap-2 rounded-xl border border-steel-200 bg-white/80 px-3 py-2 md:col-span-2">
                <input type="checkbox" checked={imapRejectUnauthorized} onChange={(e) => setImapRejectUnauthorized(e.target.checked)} />
                <span>Reject unauthorized TLS certificates</span>
              </label>
            </div>
          )}

          {inboundProtocol === "pop" && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input className="input" placeholder="POP host" value={popHost} onChange={(e) => setPopHost(e.target.value)} />
              <input className="input" type="number" placeholder="POP port" value={popPort} onChange={(e) => setPopPort(Number(e.target.value || 995))} />
              <label className="flex items-center gap-2 rounded-xl border border-steel-200 bg-white/80 px-3 py-2">
                <input type="checkbox" checked={popSecure} onChange={(e) => setPopSecure(e.target.checked)} />
                <span>POP secure (SSL/TLS)</span>
              </label>
              <input className="input" placeholder="POP login email" value={popUser} onChange={(e) => setPopUser(e.target.value)} />
              <input className="input md:col-span-2" placeholder="POP password (leave blank to keep existing)" type="password" value={popPass} onChange={(e) => setPopPass(e.target.value)} />
              <label className="flex items-center gap-2 rounded-xl border border-steel-200 bg-white/80 px-3 py-2 md:col-span-2">
                <input type="checkbox" checked={popRejectUnauthorized} onChange={(e) => setPopRejectUnauthorized(e.target.checked)} />
                <span>Reject unauthorized TLS certificates</span>
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setStatus("Saving...");
                try {
                  const res = await fetch("/api/email/account", {
                    credentials: "include",
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      smtp: {
                        host: smtpHost,
                        port: smtpPort,
                        secure: smtpSecure,
                        user: smtpUser,
                        pass: smtpPass,
                        from: smtpFrom
                      },
                      inboundProtocol,
                      useSmtpForImap,
                      imap: useSmtpForImap
                        ? undefined
                        : {
                          host: imapHost,
                          port: imapPort,
                          secure: imapSecure,
                          user: imapUser,
                          pass: imapPass,
                          rejectUnauthorized: imapRejectUnauthorized
                        },
                      pop: inboundProtocol === "pop"
                        ? {
                          host: popHost,
                          port: popPort,
                          secure: popSecure,
                          user: popUser,
                          pass: popPass,
                          rejectUnauthorized: popRejectUnauthorized
                        }
                        : undefined
                    })
                  });
                  const json = await res.json().catch(() => ({} as { error?: string; settings?: EmailSettingsResponse }));
                  if (!res.ok) throw new Error(json.error || "Failed to save email settings");
                  setConfiguredAt(json.settings?.updatedAt || new Date().toISOString());
                  setSmtpPass("");
                  setImapPass("");
                  setPopPass("");
                  setStatus("Email integration saved. You can now send and sync using this account.");
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Failed to save email settings");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving..." : "Save Email Integration"}
            </button>
            <button
              className="btn-secondary"
              disabled={saving || syncing}
              onClick={() => void runInboundSync()}
            >
              {syncing ? "Syncing..." : "Test Inbound Sync"}
            </button>
          </div>
        </>
      )}

      {status && <div className="text-xs text-steel-700">{status}</div>}
      {syncStatus && <div className="text-xs text-steel-700">{syncStatus}</div>}
    </div>
  );
}
