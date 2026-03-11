import { NextResponse } from "next/server";
import { mutateData, readData } from "@/lib/data-store";
import { requireUser } from "@/lib/server-auth";
import { saveUserEmailSettings, sanitizeUserEmailSettingsForApi } from "@/lib/user-email-config";

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const hasDb = () => Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || process.env.POSTGRES_PRISMA_URL?.trim() || process.env.SUPABASE_DATABASE_URL?.trim());
const missingPersistentDb = () => Boolean(process.env.VERCEL && !hasDb());

const toServiceError = (fallback: string, err: unknown) => {
  const message = err instanceof Error ? err.message : fallback;
  const normalized = message.toLowerCase();
  const isKnown = normalized.includes("database tls validation failed")
    || normalized.includes("self-signed certificate")
    || normalized.includes("timeout")
    || normalized.includes("temporarily unavailable")
    || normalized.includes("no database url found");
  return {
    error: isKnown ? message : fallback,
    status: isKnown ? 503 : 500
  };
};

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const data = await readData();
    const user = data.users.find((u) => u.id === auth.user.id || u.email === auth.user.email);
    return NextResponse.json({
      ok: true,
      settings: sanitizeUserEmailSettingsForApi(user?.emailSettings)
    });
  } catch (err) {
    const serviceError = toServiceError("Failed to load email settings", err);
    return NextResponse.json({ error: serviceError.error }, { status: serviceError.status });
  }
}

export async function POST(req: Request) {
  try {
    if (missingPersistentDb()) {
      return NextResponse.json({
        error: "Persistent storage is not configured. Set one of DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL, or SUPABASE_DATABASE_URL in Vercel environment variables."
      }, { status: 503 });
    }

    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({} as {
      smtp?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string };
      imap?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; rejectUnauthorized?: boolean };
      pop?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; rejectUnauthorized?: boolean };
      useSmtpForImap?: boolean;
      inboundProtocol?: "imap" | "pop";
    }));

    const smtpHost = String(body.smtp?.host ?? "").trim();
    const smtpPort = Number(body.smtp?.port ?? 587);
    const smtpSecure = Boolean(body.smtp?.secure);
    const smtpUser = String(body.smtp?.user ?? "").trim().toLowerCase();
    const smtpPass = String(body.smtp?.pass ?? "").trim();
    const smtpFrom = String(body.smtp?.from ?? "").trim().toLowerCase();

    if (!smtpHost || !smtpUser || !looksLikeEmail(smtpUser)) {
      return NextResponse.json({ error: "Valid SMTP host and SMTP user email are required." }, { status: 400 });
    }

    if (!Number.isFinite(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      return NextResponse.json({ error: "Valid SMTP port is required." }, { status: 400 });
    }

    const useSmtpForImap = body.useSmtpForImap !== false;
    const inboundProtocol = body.inboundProtocol === "pop" ? "pop" : "imap";

    let imapHost = "";
    let imapPort = 993;
    let imapSecure = true;
    let imapUser = smtpUser;
    let imapPass = smtpPass;
    let imapRejectUnauthorized = true;
    let popHost = "";
    let popPort = 995;
    let popSecure = true;
    let popUser = smtpUser;
    let popPass = smtpPass;
    let popRejectUnauthorized = true;

    if (inboundProtocol === "imap") {
      if (useSmtpForImap) {
        const lowerSmtp = smtpHost.toLowerCase();
        imapHost = lowerSmtp.includes("gmail.com")
          ? "imap.gmail.com"
          : lowerSmtp.includes("office365.com") || lowerSmtp.includes("outlook.com")
            ? "outlook.office365.com"
            : (lowerSmtp.startsWith("smtp.") ? lowerSmtp.replace(/^smtp\./, "imap.") : lowerSmtp);
      } else {
        imapHost = String(body.imap?.host ?? "").trim();
        imapPort = Number(body.imap?.port ?? 993);
        imapSecure = Boolean(body.imap?.secure ?? true);
        imapUser = String(body.imap?.user ?? smtpUser).trim().toLowerCase();
        const inboundImapPass = String(body.imap?.pass ?? "").trim();
        imapPass = inboundImapPass || (imapUser === smtpUser ? smtpPass : "");
        imapRejectUnauthorized = body.imap?.rejectUnauthorized ?? true;
      }
    } else {
      popHost = String(body.pop?.host ?? "").trim();
      popPort = Number(body.pop?.port ?? 995);
      popSecure = Boolean(body.pop?.secure ?? true);
      popUser = String(body.pop?.user ?? smtpUser).trim().toLowerCase();
      const inboundPopPass = String(body.pop?.pass ?? "").trim();
      popPass = inboundPopPass || (popUser === smtpUser ? smtpPass : "");
      popRejectUnauthorized = body.pop?.rejectUnauthorized ?? true;
    }

    if (inboundProtocol === "imap" && (!imapHost || !imapUser || !looksLikeEmail(imapUser))) {
      return NextResponse.json({ error: "Valid IMAP host and IMAP user email are required." }, { status: 400 });
    }

    if (inboundProtocol === "imap" && (!Number.isFinite(imapPort) || imapPort < 1 || imapPort > 65535)) {
      return NextResponse.json({ error: "Valid IMAP port is required." }, { status: 400 });
    }

    if (inboundProtocol === "pop" && (!popHost || !popUser || !looksLikeEmail(popUser))) {
      return NextResponse.json({ error: "Valid POP host and POP user email are required." }, { status: 400 });
    }

    if (inboundProtocol === "pop" && (!Number.isFinite(popPort) || popPort < 1 || popPort > 65535)) {
      return NextResponse.json({ error: "Valid POP port is required." }, { status: 400 });
    }

    const result = await mutateData((data) => {
      const user = data.users.find((u) => u.id === auth.user.id || u.email === auth.user.email);
      if (!user) return { ok: false as const, status: 404 as const, error: "User not found" };

      saveUserEmailSettings(user, {
        smtp: {
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          user: smtpUser,
          pass: smtpPass || undefined,
          from: smtpFrom || smtpUser
        },
        inboundProtocol,
        imap: inboundProtocol === "imap"
          ? {
            host: imapHost,
            port: imapPort,
            secure: imapSecure,
            user: imapUser,
            pass: imapPass || undefined,
            rejectUnauthorized: imapRejectUnauthorized
          }
          : undefined,
        pop: inboundProtocol === "pop"
          ? {
            host: popHost,
            port: popPort,
            secure: popSecure,
            user: popUser,
            pass: popPass || undefined,
            rejectUnauthorized: popRejectUnauthorized
          }
          : undefined
      });

      return { ok: true as const, settings: user.emailSettings };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, settings: sanitizeUserEmailSettingsForApi(result.settings) });
  } catch (err) {
    const serviceError = toServiceError("Failed to save email settings", err);
    return NextResponse.json({ error: serviceError.error }, { status: serviceError.status });
  }
}
