import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { readData, writeData } from "@/lib/data-store";
import { draftQuoteHtml, draftQuoteText, QuoteDraftMeta } from "@/lib/format";
import { upsertBuyerProfile } from "@/lib/buyer-routing";
import { requireRole } from "@/lib/server-auth";
import { QuoteLine } from "@/lib/types";

const smtpConfig = () => ({
  host: process.env.SMTP_HOST?.trim(),
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  auth: process.env.SMTP_USER && process.env.SMTP_PASS
    ? {
        user: process.env.SMTP_USER.trim(),
        // Gmail app passwords are often copied with spaces every 4 chars.
        pass: process.env.SMTP_PASS.replace(/\s+/g, "")
      }
    : undefined
});

export async function POST(req: Request) {
  try {
    const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const buyerEmail = String(body.buyerEmail ?? "").trim();
    const customerName = String(body.customerName ?? "Customer").trim();
    const lines = (body.lines ?? []) as QuoteLine[];
    const total = Number(body.total ?? 0);
    const meta = (body.meta ?? {}) as QuoteDraftMeta;

    if (!buyerEmail) {
      return NextResponse.json({ error: "buyerEmail is required" }, { status: 400 });
    }
    if (!lines.length) {
      return NextResponse.json({ error: "No quote lines to send" }, { status: 400 });
    }

    const cfg = smtpConfig();
    if (!cfg.host) {
      return NextResponse.json({
        error: "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env.local"
      }, { status: 400 });
    }

    const transporter = nodemailer.createTransport(cfg);
    const managerTag = `[#SLMGR:${auth.user.id}]`;
    const baseSubject = meta.subject || `Quotation for ${customerName}`;
    const subject = baseSubject.includes(managerTag) ? baseSubject : `${baseSubject} ${managerTag}`;
    const text = draftQuoteText(customerName, lines, total, meta);
    const html = draftQuoteHtml(customerName, lines, total, meta);
    const fromAddress = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || "";

    await transporter.sendMail({
      from: fromAddress,
      to: buyerEmail,
      subject,
      text,
      html,
      replyTo: auth.user.email
    });

    const data = await readData();
    const buyer = upsertBuyerProfile(data, auth.user.id, buyerEmail, customerName);
    data.buyerMessages.push({
      id: crypto.randomUUID(),
      buyerId: buyer.id,
      managerUserId: auth.user.id,
      direction: "outbound",
      subject,
      bodyText: text,
      fromEmail: fromAddress || auth.user.email,
      toEmail: buyerEmail,
      receivedAt: new Date().toISOString()
    });
    data.quotes.push({
      id: crypto.randomUUID(),
      customerName,
      createdByUserId: auth.user.id,
      itemsQuoted: lines,
      totalPrice: total,
      status: "Sent",
      createdAt: new Date().toISOString()
    });
    await writeData(data);

    return NextResponse.json({ ok: true, message: `Quote email sent to ${buyerEmail}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send quote email";
    const isAuthError = /535|badcredentials|auth/i.test(message);
    const hint = isAuthError
      ? "SMTP auth failed. For Gmail, use full Gmail address as SMTP_USER and a Google App Password (16 chars, no spaces), with SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE=false."
      : undefined;
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }
}
