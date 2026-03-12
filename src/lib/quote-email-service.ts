import nodemailer from "nodemailer";
import { mutateData, readData } from "@/lib/data-store";
import { upsertBuyerProfile } from "@/lib/buyer-routing";
import { draftQuoteHtml, draftQuoteText, QuoteDraftMeta } from "@/lib/format";
import { QuoteLine } from "@/lib/types";
import { getStableSmtpConfigForUser } from "@/lib/user-email-config";
import { buildQuotePdf } from "@/lib/quote-pdf";

export const sendQuoteEmail = async (params: {
  userId: string;
  userEmail: string;
  buyerEmail: string;
  customerName: string;
  lines: QuoteLine[];
  total: number;
  meta: QuoteDraftMeta;
}) => {
  const { userId, userEmail, buyerEmail, customerName, lines, total, meta } = params;
  if (!buyerEmail.trim()) throw new Error("buyerEmail is required");
  if (!lines.length) throw new Error("No quote lines to send");

  const data = await readData();
  const cfg = getStableSmtpConfigForUser(data, userId);
  if (!cfg?.host || !cfg.auth?.user || !cfg.auth.pass) {
    throw new Error("Outbound email is not configured on the server. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and optional SMTP_FROM.");
  }

  const transporter = nodemailer.createTransport(cfg);
  const managerTag = `[#SLMGR:${userId}]`;
  const baseSubject = meta.subject || `Quotation for ${customerName}`;
  const subject = baseSubject.includes(managerTag) ? baseSubject : `${baseSubject} ${managerTag}`;
  const text = draftQuoteText(customerName, lines, total, meta);
  const html = draftQuoteHtml(customerName, lines, total, meta);
  const fromAddress = cfg.from || userEmail;
  const quoteId = crypto.randomUUID();
  const quotePdf = buildQuotePdf({ quoteId, customerName, lines, total, meta });
  const safeCustomer = customerName.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "quote";
  const pdfFileName = `Contract_Quote_${safeCustomer}_${new Date().toISOString().slice(0, 10)}.pdf`;

  await transporter.sendMail({
    from: fromAddress,
    to: buyerEmail,
    subject,
    text,
    html,
    replyTo: userEmail,
    attachments: [
      {
        filename: pdfFileName,
        content: quotePdf,
        contentType: "application/pdf"
      }
    ]
  });

  await mutateData((next) => {
    const buyer = upsertBuyerProfile(next, userId, buyerEmail, customerName);
    next.buyerMessages.push({
      id: crypto.randomUUID(),
      buyerId: buyer.id,
      managerUserId: userId,
      direction: "outbound",
      subject,
      bodyText: text,
      fromEmail: fromAddress || userEmail,
      toEmail: buyerEmail,
      receivedAt: new Date().toISOString(),
      relatedQuoteId: quoteId,
      attachments: [
        {
          filename: pdfFileName,
          contentType: "application/pdf",
          kind: "quote_contract_pdf"
        }
      ]
    });
    next.quotes.push({
      id: quoteId,
      customerName,
      createdByUserId: userId,
      itemsQuoted: lines,
      totalPrice: total,
      status: "Sent",
      createdAt: new Date().toISOString(),
      sentToEmail: buyerEmail,
      lastSentAt: new Date().toISOString(),
      lastSentSubject: subject,
      contractPdfFileName: pdfFileName
    });
    return null;
  });

  return {
    quoteId,
    subject,
    text,
    message: `Quote email sent to ${buyerEmail} with contract PDF attachment`
  };
};
