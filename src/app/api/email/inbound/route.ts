import { NextResponse } from "next/server";
import { findManagerForInbound, upsertBuyerProfile, extractEmailAddress } from "@/lib/buyer-routing";
import { readData, writeData } from "@/lib/data-store";
import { filterInboundEmail } from "@/lib/inbound-filter";

const parseJsonSafe = (raw: string) => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const formDataToObject = (form: FormData) => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
};

const normalizeEmailField = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return "";
};

const parseInboundBody = async (req: Request) => {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return (await req.json()) as Record<string, unknown>;
  }
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    return formDataToObject(form);
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    const out: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) out[key] = value;
    return out;
  }

  const raw = await req.text();
  return parseJsonSafe(raw);
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const pickText = (body: Record<string, unknown>) => {
  const text = String(body.text ?? body.body ?? body["stripped-text"] ?? body["body-plain"] ?? "").trim();
  if (text) return text;
  const html = String(body.html ?? body["body-html"] ?? "").trim();
  return html ? stripHtml(html) : "";
};

export async function POST(req: Request) {
  try {
    const secret = process.env.INBOUND_EMAIL_SECRET?.trim();
    if (secret) {
      const provided = req.headers.get("x-inbound-secret")?.trim();
      if (!provided || provided !== secret) {
        return NextResponse.json({ error: "Unauthorized inbound webhook" }, { status: 401 });
      }
    }

    const body = await parseInboundBody(req);
    const defaultInboundAddress = process.env.INBOUND_ROUTE_ADDRESS?.trim() || "yz2936@nyu.edu";
    const envelopeRaw = typeof body.envelope === "string" ? parseJsonSafe(body.envelope) : {};
    const from = normalizeEmailField(body.from ?? body.sender ?? body.fromEmail ?? body.from_email ?? envelopeRaw.from);
    const toRaw = normalizeEmailField(body.to ?? body.recipient ?? body.toEmail ?? body.to_email ?? envelopeRaw.to);
    const to = toRaw || defaultInboundAddress;
    const subject = String(body.subject ?? body["headers.subject"] ?? "").trim() || "Buyer Reply";
    const text = pickText(body);

    if (!from || !to || !text) {
      return NextResponse.json({ error: "from, to, and text are required" }, { status: 400 });
    }

    const decision = await filterInboundEmail(subject, text);
    if (!decision.accept) {
      return NextResponse.json({
        ok: true,
        filtered: true,
        reason: decision.reason,
        mode: decision.mode
      });
    }

    const data = await readData();
    const manager = findManagerForInbound(data, to, subject);
    if (!manager) {
      return NextResponse.json({ error: "No sales manager available for routing" }, { status: 404 });
    }

    const buyer = upsertBuyerProfile(data, manager.id, from);
    data.buyerMessages.push({
      id: crypto.randomUUID(),
      buyerId: buyer.id,
      managerUserId: manager.id,
      direction: "inbound",
      subject,
      bodyText: text,
      fromEmail: extractEmailAddress(from),
      toEmail: extractEmailAddress(to),
      receivedAt: new Date().toISOString()
    });

    buyer.status = "Active";
    buyer.lastInteractionAt = new Date().toISOString();
    buyer.updatedAt = new Date().toISOString();

    await writeData(data);

    return NextResponse.json({ ok: true, routedToManagerId: manager.id, buyerId: buyer.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inbound routing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
