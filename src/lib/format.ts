import { ExtractedLineItem, QuoteLine } from "@/lib/types";

export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

export const stockLabel = (status: "green" | "yellow" | "red") =>
  status === "green" ? "In Stock" : status === "yellow" ? "Partial Stock" : "Out of Stock";

export const stockColor = (status: "green" | "yellow" | "red") =>
  status === "green" ? "bg-emerald-500" : status === "yellow" ? "bg-amber-400" : "bg-rose-500";

export const formatInches = (n?: number) => (
  Number.isFinite(n) ? `${Number(n).toFixed(3).replace(/\.?0+$/, "")} in` : undefined
);

export const summarizeRequestedSpecs = (item: ExtractedLineItem) => {
  const specs = [
    item.dimensionSummary,
    item.nominalSize ? `NPS ${item.nominalSize}` : undefined,
    item.schedule ? `SCH ${item.schedule}` : undefined,
    item.pressureClass,
    item.od ? `OD ${formatInches(item.od)}` : undefined,
    item.id ? `ID ${formatInches(item.id)}` : undefined,
    item.wall ? `Wall ${formatInches(item.wall)}` : undefined,
    item.angle ? `${item.angle}°` : undefined,
    item.radius,
    item.endType,
    item.endTypeSecondary,
    item.face,
    item.finish,
    item.notes
  ].filter(Boolean) as string[];

  return Array.from(new Set(specs));
};

export const standardsLabel = (item: ExtractedLineItem) =>
  item.standards?.length ? item.standards.join(", ") : undefined;

export const describeRequestedItem = (item: ExtractedLineItem) => {
  const head = [item.grade, item.category].filter(Boolean).join(" ").trim();
  const detail = summarizeRequestedSpecs(item).join(" | ");
  return [head, detail].filter(Boolean).join(" | ");
};

export type QuoteDraftMeta = {
  buyerName?: string;
  subject?: string;
  intro?: string;
  validDays?: number;
  eta?: string;
  incoterm?: string;
  paymentTerms?: string;
  freightTerms?: string;
  notes?: string;
  senderName?: string;
  senderTitle?: string;
  companyName?: string;
};

const defaultMeta = (customerName: string): Required<QuoteDraftMeta> => ({
  buyerName: customerName,
  subject: `Quotation for ${customerName}`,
  intro: `Thank you for the opportunity. Please find our quotation below for ${customerName}.`,
  validDays: 7,
  eta: "Earliest available",
  incoterm: "FOB Origin",
  paymentTerms: "Net 30",
  freightTerms: "Packed for sea freight",
  notes: "",
  senderName: "Sales Team",
  senderTitle: "Inside Sales",
  companyName: "Stainless Logic"
});

export const draftQuoteText = (customerName: string, lines: QuoteLine[], total: number, meta?: QuoteDraftMeta) => {
  const cfg = { ...defaultMeta(customerName), ...(meta ?? {}) };
  const head = `Subject: ${cfg.subject}\n\nTo: ${cfg.buyerName}\n\n${cfg.intro}\n\nItem | Qty | Unit Price | Ext Price\n-----|-----|------------|----------`;
  const body = lines
    .map((l) => `${l.description} | ${l.quantity} ${l.unit} | ${money(l.unitPrice)} | ${money(l.extendedPrice)}`)
    .join("\n");
  const terms = [
    `ETA: ${cfg.eta}`,
    `Incoterm: ${cfg.incoterm}`,
    `Payment Terms: ${cfg.paymentTerms}`,
    `Freight: ${cfg.freightTerms}`,
    `Validity: ${cfg.validDays} days`,
    "Material subject to prior sale."
  ].join("\n");
  const notes = cfg.notes ? `\n\nNotes:\n${cfg.notes}` : "";
  const sig = `\n\nRegards,\n${cfg.senderName}\n${cfg.senderTitle}\n${cfg.companyName}`;
  return `${head}\n${body}\n\nTotal: ${money(total)}\n\n${terms}${notes}${sig}`;
};

export const draftQuoteHtml = (customerName: string, lines: QuoteLine[], total: number, meta?: QuoteDraftMeta) => {
  const cfg = { ...defaultMeta(customerName), ...(meta ?? {}) };
  const rows = lines.map((l) => `
    <tr>
      <td style="border:1px solid #d0d7de;padding:8px;">${l.description}</td>
      <td style="border:1px solid #d0d7de;padding:8px;">${l.quantity} ${l.unit}</td>
      <td style="border:1px solid #d0d7de;padding:8px;">${money(l.unitPrice)}</td>
      <td style="border:1px solid #d0d7de;padding:8px;">${money(l.extendedPrice)}</td>
    </tr>
  `).join("");

  const notes = cfg.notes ? `<p><strong>Notes:</strong> ${cfg.notes}</p>` : "";

  return `
  <div style="font-family:Arial,sans-serif;color:#1f2937;">
    <p>Dear ${cfg.buyerName},</p>
    <p>${cfg.intro}</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead>
        <tr>
          <th style="border:1px solid #d0d7de;padding:8px;text-align:left;">Item</th>
          <th style="border:1px solid #d0d7de;padding:8px;text-align:left;">Qty</th>
          <th style="border:1px solid #d0d7de;padding:8px;text-align:left;">Unit Price</th>
          <th style="border:1px solid #d0d7de;padding:8px;text-align:left;">Extended</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p><strong>Total:</strong> ${money(total)}</p>
    <p><strong>ETA:</strong> ${cfg.eta}<br/>
    <strong>Incoterm:</strong> ${cfg.incoterm}<br/>
    <strong>Payment Terms:</strong> ${cfg.paymentTerms}<br/>
    <strong>Freight:</strong> ${cfg.freightTerms}<br/>
    <strong>Validity:</strong> ${cfg.validDays} days<br/>
    Material subject to prior sale.</p>
    ${notes}
    <p>Regards,<br/>${cfg.senderName}<br/>${cfg.senderTitle}<br/>${cfg.companyName}</p>
  </div>`;
};
