import { money, QuoteDraftMeta } from "@/lib/format";
import { QuoteLine } from "@/lib/types";

const escapePdfText = (s: string) =>
  s
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");

const wrapLine = (line: string, width = 92) => {
  if (line.length <= width) return [line];
  const out: string[] = [];
  let rest = line.trim();
  while (rest.length > width) {
    const cut = rest.lastIndexOf(" ", width);
    const idx = cut > 0 ? cut : width;
    out.push(rest.slice(0, idx).trimEnd());
    rest = rest.slice(idx).trimStart();
  }
  if (rest) out.push(rest);
  return out;
};

const buildPages = (lines: string[], linesPerPage = 48) => {
  const pages: string[][] = [];
  let page: string[] = [];
  for (const line of lines) {
    const wrapped = wrapLine(line);
    for (const part of wrapped) {
      if (page.length >= linesPerPage) {
        pages.push(page);
        page = [];
      }
      page.push(part);
    }
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [["(No quote content)"]];
};

const buildContentStream = (pageLines: string[]) => {
  const textOps = pageLines.map((line, i) => `${i === 0 ? "" : "T* " }(${escapePdfText(line)}) Tj`).join("\n");
  return [
    "BT",
    "/F1 9 Tf",
    "13 TL",
    "44 800 Td",
    textOps,
    "ET"
  ].join("\n");
};

const buildPdfBufferFromPages = (pages: string[][]) => {
  const objects: Array<{ id: number; body: string }> = [];
  let nextId = 4;
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    const stream = buildContentStream(pageLines);
    const streamLen = Buffer.byteLength(stream, "utf8");

    objects.push({
      id: contentId,
      body: `<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`
    });
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
    });
  }

  const baseObjects: Array<{ id: number; body: string }> = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 2, body: `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>` },
    { id: 3, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>" }
  ];

  const all = [...baseObjects, ...objects].sort((a, b) => a.id - b.id);
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of all) {
    offsets[obj.id] = Buffer.byteLength(pdf, "utf8");
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  const maxObj = all[all.length - 1]?.id || 3;
  pdf += `xref\n0 ${maxObj + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= maxObj; i += 1) {
    const off = offsets[i] || 0;
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
};

export const buildQuotePdf = (params: {
  quoteId?: string;
  customerName: string;
  lines: QuoteLine[];
  total: number;
  meta?: QuoteDraftMeta;
}) => {
  const cfg = {
    companyName: params.meta?.companyName || "Stainless Logic",
    buyerName: params.meta?.buyerName || params.customerName,
    subject: params.meta?.subject || `Quotation for ${params.customerName}`,
    eta: params.meta?.eta || "Earliest available",
    incoterm: params.meta?.incoterm || "FOB Origin",
    paymentTerms: params.meta?.paymentTerms || "Net 30",
    freightTerms: params.meta?.freightTerms || "Packed for sea freight",
    validDays: Number(params.meta?.validDays ?? 7),
    senderName: params.meta?.senderName || "Sales Team",
    senderTitle: params.meta?.senderTitle || "Inside Sales",
    notes: params.meta?.notes || ""
  };
  const quoteNo = params.quoteId || `Q-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const divider = "-".repeat(93);
  const tableHeader = [
    "#".padEnd(4),
    "Item".padEnd(49),
    "Qty".padEnd(12),
    "Unit".padEnd(13),
    "Ext".padEnd(13)
  ].join("");
  const tableLines = params.lines.flatMap((line, index) => {
    const itemParts = wrapLine(line.description, 48);
    return itemParts.map((part, partIndex) => [
      partIndex === 0 ? String(index + 1).padEnd(4) : "".padEnd(4),
      part.padEnd(49),
      partIndex === 0 ? `${line.quantity} ${line.unit}`.padEnd(12) : "".padEnd(12),
      partIndex === 0 ? money(line.unitPrice).padEnd(13) : "".padEnd(13),
      partIndex === 0 ? money(line.extendedPrice).padEnd(13) : "".padEnd(13)
    ].join(""));
  });
  const structuredLines = [
    `${cfg.companyName.toUpperCase()} - COMMERCIAL QUOTATION`,
    `Generated: ${new Date().toLocaleString()}`,
    `Quote No: ${quoteNo}`,
    `Subject: ${cfg.subject}`,
    "",
    "CUSTOMER",
    `Seller: ${cfg.companyName}`,
    `Buyer: ${cfg.buyerName}`,
    "",
    "LINE ITEMS",
    divider,
    tableHeader,
    divider,
    ...tableLines,
    divider,
    `${"".padEnd(65)}Total: ${money(params.total)}`,
    "",
    "COMMERCIAL TERMS",
    `ETA: ${cfg.eta}`,
    `Incoterm: ${cfg.incoterm}`,
    `Payment Terms: ${cfg.paymentTerms}`,
    `Freight Terms: ${cfg.freightTerms}`,
    `Quotation Validity: ${cfg.validDays} calendar days`,
    "",
    "CONDITIONS",
    "- Material is subject to prior sale and mill confirmation.",
    "- Buyer approval confirms dimensions, grade, and quantity.",
    "- Any changes after approval may change lead time and pricing.",
    ...(cfg.notes ? ["", "ADDITIONAL NOTES", ...wrapLine(cfg.notes, 88)] : []),
    "",
    "SIGNATURE",
    `Issued By: ${cfg.senderName} (${cfg.senderTitle})`,
    "Buyer Acceptance Signature: ____________________________"
  ];
  return buildPdfBufferFromPages(buildPages(structuredLines));
};
