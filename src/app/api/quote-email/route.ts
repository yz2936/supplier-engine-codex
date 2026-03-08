import { NextResponse } from "next/server";
import { QuoteDraftMeta } from "@/lib/format";
import { requireRole } from "@/lib/server-auth";
import { QuoteLine } from "@/lib/types";
import { sendQuoteEmail } from "@/lib/quote-email-service";

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

    const sent = await sendQuoteEmail({
      userId: auth.user.id,
      userEmail: auth.user.email,
      buyerEmail,
      customerName,
      lines,
      total,
      meta
    });

    return NextResponse.json({ ok: true, message: sent.message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send quote email";
    const isAuthError = /535|badcredentials|auth/i.test(message);
    const hint = isAuthError
      ? "SMTP auth failed. For Gmail, use full Gmail address as SMTP_USER and a Google App Password (16 chars, no spaces), with SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE=false."
      : undefined;
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }
}
