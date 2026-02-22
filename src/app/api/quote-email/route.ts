import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { mutateData, readData } from "@/lib/data-store";
import { draftQuoteHtml, draftQuoteText, QuoteDraftMeta } from "@/lib/format";
import { upsertBuyerProfile } from "@/lib/buyer-routing";
import { requireRole } from "@/lib/server-auth";
import { QuoteLine } from "@/lib/types";
import { getSmtpConfigForUser } from "@/lib/user-email-config";
import { buildQuotePdf } from "@/lib/quote-pdf";

export async function POST(req: Request) {
  try {
    const auth = await requireRole(req, ["sales_rep", "sales_manager", "inventory_manager"]);
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

    const data = await readData();
    const cfg = getSmtpConfigForUser(data, auth.user.id);
    if (!cfg?.host || !cfg.auth?.user || !cfg.auth.pass) {
      return NextResponse.json({
        error: "Email account is not configured. Go to Settings -> Email Integration and connect your SMTP/IMAP account."
      }, { status: 400 });
    }

    const transporter = nodemailer.createTransport(cfg);
    const managerTag = `[#SLMGR:${auth.user.id}]`;
    const baseSubject = meta.subject || `Quotation for ${customerName}`;
    const subject = baseSubject.includes(managerTag) ? baseSubject : `${baseSubject} ${managerTag}`;
    const text = draftQuoteText(customerName, lines, total, meta);
    const html = draftQuoteHtml(customerName, lines, total, meta);
    const fromAddress = cfg.from || auth.user.email;
    const quotePdf = buildQuotePdf({ customerName, lines, total, meta });
    const safeCustomer = customerName.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "quote";
    const pdfFileName = `Quotation_${safeCustomer}_${new Date().toISOString().slice(0, 10)}.pdf`;

    await transporter.sendMail({
      from: fromAddress,
      to: buyerEmail,
      subject,
      text,
      html,
      replyTo: auth.user.email,
      attachments: [
        {
          filename: pdfFileName,
          content: quotePdf,
          contentType: "application/pdf"
        }
      ]
    });

    await mutateData((data) => {
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
      return null;
    });

    return NextResponse.json({ ok: true, message: `Quote email sent to ${buyerEmail} with PDF attachment` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send quote email";
    const isAuthError = /535|badcredentials|auth/i.test(message);
    const hint = isAuthError
      ? "SMTP auth failed. For Gmail, use full Gmail address as SMTP_USER and a Google App Password (16 chars, no spaces), with SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE=false."
      : undefined;
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }
}
