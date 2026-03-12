import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { getSmtpConfigForUser } from "@/lib/user-email-config";
import { requireUser } from "@/lib/server-auth";

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const hasDb = () => Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || process.env.POSTGRES_PRISMA_URL?.trim() || process.env.SUPABASE_DATABASE_URL?.trim());
const missingPersistentDb = () => Boolean(process.env.VERCEL && !hasDb());

export async function POST(req: Request) {
  if (missingPersistentDb()) {
    return NextResponse.json({
      error: "Persistent storage is not configured. Set one of DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL, or SUPABASE_DATABASE_URL in Vercel environment variables."
    }, { status: 503 });
  }

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({} as {
      smtp?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string };
      recipient?: string;
    }));
    const data = await readData();
    const savedSmtp = getSmtpConfigForUser(data, auth.user.id);

    const smtpHost = String(body.smtp?.host ?? savedSmtp?.host ?? "").trim();
    const smtpPort = Number(body.smtp?.port ?? savedSmtp?.port ?? 587);
    const smtpSecure = typeof body.smtp?.secure === "boolean" ? body.smtp.secure : Boolean(savedSmtp?.secure);
    const smtpUser = String(body.smtp?.user ?? savedSmtp?.auth?.user ?? "").trim().toLowerCase();
    const smtpPass = String(body.smtp?.pass ?? savedSmtp?.auth?.pass ?? "").trim();
    const smtpFrom = String(body.smtp?.from ?? savedSmtp?.from ?? "").trim() || smtpUser;
    const recipient = String(body.recipient ?? "").trim().toLowerCase();

    if (!smtpHost || !smtpUser || !smtpPass || !looksLikeEmail(smtpUser)) {
      return NextResponse.json({ error: "SMTP host, full email login, and password are required." }, { status: 400 });
    }
    if (!recipient || !looksLikeEmail(recipient)) {
      return NextResponse.json({ error: "A valid test recipient email is required." }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass }
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: recipient,
      subject: "Stainless Logic email integration test",
      text: `Test email sent at ${new Date().toLocaleString()} from ${smtpUser}.`
    });

    return NextResponse.json({ ok: true, message: `Test email sent to ${recipient}.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send test email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
