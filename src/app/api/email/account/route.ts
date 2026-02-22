import { NextResponse } from "next/server";
import { mutateData, readData } from "@/lib/data-store";
import { requireUser } from "@/lib/server-auth";
import { saveUserEmailSettings, sanitizeUserEmailSettingsForApi } from "@/lib/user-email-config";

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const data = await readData();
  const user = data.users.find((u) => u.id === auth.user.id);
  return NextResponse.json({
    ok: true,
    settings: sanitizeUserEmailSettingsForApi(user?.emailSettings)
  });
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({} as {
    smtp?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string };
    imap?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; rejectUnauthorized?: boolean };
    useSmtpForImap?: boolean;
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

  let imapHost = "";
  let imapPort = 993;
  let imapSecure = true;
  let imapUser = smtpUser;
  let imapPass = smtpPass;
  let imapRejectUnauthorized = true;

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
    imapPass = String(body.imap?.pass ?? smtpPass).trim();
    imapRejectUnauthorized = body.imap?.rejectUnauthorized ?? true;
  }

  if (!imapHost || !imapUser || !looksLikeEmail(imapUser)) {
    return NextResponse.json({ error: "Valid IMAP host and IMAP user email are required." }, { status: 400 });
  }

  if (!Number.isFinite(imapPort) || imapPort < 1 || imapPort > 65535) {
    return NextResponse.json({ error: "Valid IMAP port is required." }, { status: 400 });
  }

  const result = await mutateData((data) => {
    const user = data.users.find((u) => u.id === auth.user.id);
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
      imap: {
        host: imapHost,
        port: imapPort,
        secure: imapSecure,
        user: imapUser,
        pass: imapPass || undefined,
        rejectUnauthorized: imapRejectUnauthorized
      }
    });

    return { ok: true as const, settings: user.emailSettings };
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, settings: sanitizeUserEmailSettingsForApi(result.settings) });
}
