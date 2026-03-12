import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { getImapConfigForUser, getPopConfigForUser, getSmtpConfigForUser } from "@/lib/user-email-config";
import { requireUser } from "@/lib/server-auth";
import { verifyInboundMailboxConnection } from "@/lib/inbound-sync";

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const hasDb = () => Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || process.env.POSTGRES_PRISMA_URL?.trim() || process.env.SUPABASE_DATABASE_URL?.trim());
const missingPersistentDb = () => Boolean(process.env.VERCEL && !hasDb());

type EmailAccountTestBody = {
  smtp?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string };
  imap?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; rejectUnauthorized?: boolean };
  pop?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; rejectUnauthorized?: boolean };
  useSmtpForImap?: boolean;
  inboundProtocol?: "imap" | "pop";
  target?: "smtp" | "inbound" | "both";
};

const inferImapHostFromSmtp = (smtpHost: string) => {
  const lowerSmtp = smtpHost.toLowerCase();
  return lowerSmtp.includes("gmail.com")
    ? "imap.gmail.com"
    : lowerSmtp.includes("office365.com") || lowerSmtp.includes("outlook.com")
      ? "outlook.office365.com"
      : (lowerSmtp.startsWith("smtp.") ? lowerSmtp.replace(/^smtp\./, "imap.") : lowerSmtp);
};

export async function POST(req: Request) {
  if (missingPersistentDb()) {
    return NextResponse.json({
      error: "Persistent storage is not configured. Set one of DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL, or SUPABASE_DATABASE_URL in Vercel environment variables."
    }, { status: 503 });
  }

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({} as EmailAccountTestBody));
  const data = await readData();
  const savedSmtp = getSmtpConfigForUser(data, auth.user.id);
  const savedImap = getImapConfigForUser(data, auth.user.id);
  const savedPop = getPopConfigForUser(data, auth.user.id);
  const target = body.target === "smtp" || body.target === "inbound" ? body.target : "both";
  const inboundProtocol = body.inboundProtocol === "pop" ? "pop" : "imap";

  const smtpHost = String(body.smtp?.host ?? savedSmtp?.host ?? "").trim();
  const smtpPort = Number(body.smtp?.port ?? savedSmtp?.port ?? 587);
  const smtpSecure = typeof body.smtp?.secure === "boolean" ? body.smtp.secure : Boolean(savedSmtp?.secure);
  const smtpUser = String(body.smtp?.user ?? savedSmtp?.auth?.user ?? "").trim().toLowerCase();
  const smtpPass = String(body.smtp?.pass ?? savedSmtp?.auth?.pass ?? "").trim();
  const useSmtpForImap = body.useSmtpForImap !== false;

  if ((target === "smtp" || target === "both") && (!smtpHost || !smtpUser || !smtpPass || !looksLikeEmail(smtpUser))) {
    return NextResponse.json({ error: "SMTP host, full email login, and password are required for testing." }, { status: 400 });
  }

  let inboundHost = "";
  let inboundPort = inboundProtocol === "pop" ? 995 : 993;
  let inboundSecure = true;
  let inboundUser = smtpUser;
  let inboundPass = smtpPass;
  let inboundRejectUnauthorized = true;

  if (inboundProtocol === "imap") {
    if (useSmtpForImap) {
      inboundHost = inferImapHostFromSmtp(smtpHost);
    } else {
      inboundHost = String(body.imap?.host ?? savedImap?.host ?? "").trim();
      inboundPort = Number(body.imap?.port ?? savedImap?.port ?? 993);
      inboundSecure = typeof body.imap?.secure === "boolean" ? body.imap.secure : Boolean(savedImap?.secure ?? true);
      inboundUser = String(body.imap?.user ?? savedImap?.auth?.user ?? smtpUser).trim().toLowerCase();
      inboundPass = String(body.imap?.pass ?? savedImap?.auth?.pass ?? "").trim() || (inboundUser === smtpUser ? smtpPass : "");
      inboundRejectUnauthorized = body.imap?.rejectUnauthorized ?? savedImap?.rejectUnauthorized ?? true;
    }
  } else {
    inboundHost = String(body.pop?.host ?? savedPop?.host ?? "").trim();
    inboundPort = Number(body.pop?.port ?? savedPop?.port ?? 995);
    inboundSecure = typeof body.pop?.secure === "boolean" ? body.pop.secure : Boolean(savedPop?.secure ?? true);
    inboundUser = String(body.pop?.user ?? savedPop?.auth?.user ?? smtpUser).trim().toLowerCase();
    inboundPass = String(body.pop?.pass ?? savedPop?.auth?.pass ?? "").trim() || (inboundUser === smtpUser ? smtpPass : "");
    inboundRejectUnauthorized = body.pop?.rejectUnauthorized ?? savedPop?.rejectUnauthorized ?? true;
  }

  if ((target === "inbound" || target === "both") && (!inboundHost || !inboundUser || !inboundPass || !looksLikeEmail(inboundUser))) {
    return NextResponse.json({ error: `${inboundProtocol.toUpperCase()} host, full email login, and password are required for testing.` }, { status: 400 });
  }

  try {
    const result: { smtp?: string; inbound?: string } = {};

    if (target === "smtp" || target === "both") {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass }
      });
      await transporter.verify();
      result.smtp = "SMTP connection verified.";
    }

    if (target === "inbound" || target === "both") {
      result.inbound = await verifyInboundMailboxConnection({
        protocol: inboundProtocol,
        config: {
          host: inboundHost,
          port: inboundPort,
          secure: inboundSecure,
          auth: { user: inboundUser, pass: inboundPass },
          rejectUnauthorized: inboundRejectUnauthorized
        }
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email account test failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
