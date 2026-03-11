import { NextResponse } from "next/server";
import { extractEmailAddress, upsertBuyerProfile } from "@/lib/buyer-routing";
import { mutateData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export async function POST(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({} as {
      buyerEmail?: string;
      buyerName?: string;
      subject?: string;
      bodyText?: string;
    }));

    const buyerEmail = String(body.buyerEmail ?? "").trim().toLowerCase();
    const buyerName = String(body.buyerName ?? "").trim();
    const subject = String(body.subject ?? "").trim() || "Forwarded buyer request";
    const bodyText = String(body.bodyText ?? "").trim();

    if (!buyerEmail || !looksLikeEmail(buyerEmail)) {
      return NextResponse.json({ error: "Valid buyer email is required." }, { status: 400 });
    }

    if (!bodyText) {
      return NextResponse.json({ error: "Email body text is required." }, { status: 400 });
    }

    const result = await mutateData((data) => {
      const buyer = upsertBuyerProfile(data, auth.user.id, buyerEmail, buyerName || buyerEmail);
      const messageId = crypto.randomUUID();

      if (buyerName) {
        buyer.companyName = buyerName;
      }
      buyer.email = extractEmailAddress(buyerEmail) || buyerEmail;
      buyer.status = "Active";
      buyer.lastInteractionAt = new Date().toISOString();
      buyer.updatedAt = new Date().toISOString();

      data.buyerMessages.push({
        id: messageId,
        sourceMessageId: `manual-${messageId}`,
        buyerId: buyer.id,
        managerUserId: auth.user.id,
        direction: "inbound",
        subject,
        bodyText,
        fromEmail: buyer.email,
        toEmail: auth.user.email,
        receivedAt: new Date().toISOString()
      });

      return {
        buyerId: buyer.id,
        buyerName: buyer.companyName,
        buyerEmail: buyer.email,
        messageId
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import forwarded email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
