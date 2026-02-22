"use client";

import { useEffect, useState } from "react";

type EmailSettingsResponse = {
  configured?: boolean;
  updatedAt?: string;
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
};

export function EmailIntegrationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [useSmtpForImap, setUseSmtpForImap] = useState(true);
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [imapUser, setImapUser] = useState("");
  const [imapPass, setImapPass] = useState("");
  const [imapRejectUnauthorized, setImapRejectUnauthorized] = useState(true);
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
        if (settings.updatedAt) setConfiguredAt(settings.updatedAt);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Failed to load email settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
        Add your own SMTP/IMAP account once. Outbound quote/sourcing emails and inbound buyer sync will use these credentials.
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

          <label className="flex items-center gap-2 rounded-xl border border-steel-200 bg-white/80 px-3 py-2">
            <input type="checkbox" checked={useSmtpForImap} onChange={(e) => setUseSmtpForImap(e.target.checked)} />
            <span>Use same account for inbound IMAP</span>
          </label>

          {!useSmtpForImap && (
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
                        }
                    })
                  });
                  const json = await res.json().catch(() => ({} as { error?: string; settings?: EmailSettingsResponse }));
                  if (!res.ok) throw new Error(json.error || "Failed to save email settings");
                  setConfiguredAt(json.settings?.updatedAt || new Date().toISOString());
                  setSmtpPass("");
                  setImapPass("");
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
          </div>
        </>
      )}

      {status && <div className="text-xs text-steel-700">{status}</div>}
    </div>
  );
}
