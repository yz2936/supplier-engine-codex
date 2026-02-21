import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { readData, writeData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

const smtpConfig = () => ({
  host: process.env.SMTP_HOST?.trim(),
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  auth: process.env.SMTP_USER && process.env.SMTP_PASS
    ? {
        user: process.env.SMTP_USER.trim(),
        pass: process.env.SMTP_PASS.replace(/\s+/g, "")
      }
    : undefined
});

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

const buildDefaultBody = (request: {
  customerName?: string;
  items: Array<{ productType: string; grade: string; dimension?: string; quantity: number; unit: "pcs" | "lbs" }>;
  notes?: string;
  reason: "low_stock" | "out_of_stock" | "new_demand";
}) => {
  const reasonText = request.reason === "out_of_stock"
    ? "out-of-stock replenishment"
    : request.reason === "low_stock"
      ? "low-stock replenishment"
      : "new demand";
  const lines = request.items.map((item, i) =>
    `${i + 1}. ${item.productType} | Grade ${item.grade}${item.dimension ? ` | ${item.dimension}` : ""} | Qty ${item.quantity} ${item.unit}`
  ).join("\n");

  return [
    "Hello,",
    "",
    `Please quote the following items for ${reasonText}${request.customerName ? ` (customer: ${request.customerName})` : ""}:`,
    "",
    lines,
    "",
    "Please include:",
    "- Unit price and MOQ",
    "- Earliest production + shipment lead time",
    "- Packaging details",
    "- Freight/incoterm assumptions",
    request.notes ? "" : "",
    request.notes ? `Internal notes/context: ${request.notes}` : "",
    "",
    "Thank you."
  ].filter(Boolean).join("\n");
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole(req, ["sales_rep", "inventory_manager", "sales_manager"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json().catch(() => ({} as { to?: string; subject?: string; message?: string }));
    const to = String(body.to ?? "").trim().toLowerCase();
    const overrideSubject = String(body.subject ?? "").trim();
    const overrideMessage = String(body.message ?? "").trim();

    const cfg = smtpConfig();
    if (!cfg.host) {
      return NextResponse.json({
        error: "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env.local"
      }, { status: 400 });
    }

    const data = await readData();
    const requestIndex = data.sourcingRequests.findIndex((r) => r.id === id);
    if (requestIndex < 0) return NextResponse.json({ error: "Sourcing request not found" }, { status: 404 });
    const request = data.sourcingRequests[requestIndex];

    const manufacturer = data.manufacturers.find((m) => m.id === request.manufacturerId);
    const recipient = to || manufacturer?.email || request.manufacturerEmail || "";
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return NextResponse.json({ error: "Manufacturer email is missing or invalid" }, { status: 400 });
    }

    const subject = overrideSubject || `Sourcing RFQ Request ${request.id.slice(0, 8)} - ${request.manufacturerName}`;
    const text = overrideMessage || buildDefaultBody(request);
    const html = text
      .split("\n")
      .map((line) => line.trim() ? `<p style="margin:0 0 8px 0;">${escapeHtml(line)}</p>` : "<br/>")
      .join("");

    const transporter = nodemailer.createTransport(cfg);
    const fromAddress = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || "";
    await transporter.sendMail({
      from: fromAddress,
      to: recipient,
      subject,
      text,
      html,
      replyTo: auth.user.email
    });

    const now = new Date().toISOString();
    data.sourcingRequests[requestIndex] = {
      ...request,
      manufacturerEmail: recipient,
      lastEmailedAt: now,
      lastEmailedByUserId: auth.user.id,
      lastEmailSubject: subject,
      updatedAt: now
    };
    await writeData(data);

    return NextResponse.json({ ok: true, message: `Sourcing email sent to ${recipient}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send sourcing email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

