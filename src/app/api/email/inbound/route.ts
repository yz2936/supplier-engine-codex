import { NextResponse } from "next/server";
import { findManagerForInbound, upsertBuyerProfile, extractEmailAddress } from "@/lib/buyer-routing";
import { mutateData } from "@/lib/data-store";
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

const extractForwardedField = (label: string, text: string) => {
  const patterns = [
    new RegExp(`^${label}:\\s*(.+)$`, "im"),
    new RegExp(`^-+\\s*${label}:\\s*(.+)$`, "im")
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
};

const extractForwardedMessage = (subject: string, text: string) => {
  const normalized = text.replace(/\r\n/g, "\n");
  const forwardedMarker = /-{2,}\s*forwarded message\s*-{2,}|begin forwarded message|from:\s.+\n(?:date|sent):/i;
  if (!/^fw:|^fwd:/i.test(subject) && !forwardedMarker.test(normalized)) return null;

  const forwardedFrom = extractForwardedField("From", normalized);
  const forwardedSubject = extractForwardedField("Subject", normalized);
  const bodyStart = normalized.search(/^(?:hello|hi|dear|\s*$|\d+\s*(?:pcs|ea|ft|m)\b|qty\b|quotation\b|rfq\b)/im);
  const forwardedBody = bodyStart >= 0 ? normalized.slice(bodyStart).trim() : normalized.trim();

  return {
    from: forwardedFrom,
    subject: forwardedSubject || subject.replace(/^fwd?:\s*/i, "").trim(),
    bodyText: forwardedBody
  };
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
    const rawSubject = String(body.subject ?? body["headers.subject"] ?? "").trim() || "Buyer Reply";
    const rawText = pickText(body);
    const forwarded = extractForwardedMessage(rawSubject, rawText);
    const effectiveFrom = forwarded?.from ? normalizeEmailField(forwarded.from) : from;
    const subject = forwarded?.subject || rawSubject;
    const text = forwarded?.bodyText || rawText;

    if (!effectiveFrom || !to || !text) {
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

    const routed = await mutateData((data) => {
      const manager = findManagerForInbound(data, to, subject);
      if (!manager) return null;

      const buyer = upsertBuyerProfile(data, manager.id, effectiveFrom);
      data.buyerMessages.push({
        id: crypto.randomUUID(),
        buyerId: buyer.id,
        managerUserId: manager.id,
        direction: "inbound",
        subject,
        bodyText: text,
        fromEmail: extractEmailAddress(effectiveFrom),
        toEmail: extractEmailAddress(to),
        receivedAt: new Date().toISOString()
      });

      buyer.status = "Active";
      buyer.lastInteractionAt = new Date().toISOString();
      buyer.updatedAt = new Date().toISOString();

      return { managerId: manager.id, buyerId: buyer.id };
    });

    if (!routed) {
      return NextResponse.json({ error: "No sales manager available for routing" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, routedToManagerId: routed.managerId, buyerId: routed.buyerId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inbound routing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
