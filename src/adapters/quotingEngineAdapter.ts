import {
  InventoryMatch,
  LastQuoteComparison,
  LineItem,
  QueueFilters,
  QueueStatus,
  RfqCard,
  RfqDetail,
  RiskFlag
} from "@/types/quotingEngine";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mockRfqs: RfqCard[] = [
  {
    id: "RFQ-24071",
    customerId: "c-1",
    customerName: "Acme Fabrication",
    receivedAt: "2026-02-21T09:20:00.000Z",
    dueDate: "2026-02-25",
    itemCount: 4,
    priority: "high",
    status: "new"
  },
  {
    id: "RFQ-24068",
    customerId: "c-2",
    customerName: "North Harbor Energy",
    receivedAt: "2026-02-20T14:42:00.000Z",
    dueDate: "2026-02-28",
    itemCount: 7,
    priority: "medium",
    status: "in_progress"
  },
  {
    id: "RFQ-24063",
    customerId: "c-3",
    customerName: "Delta Process Systems",
    receivedAt: "2026-02-18T12:10:00.000Z",
    dueDate: "2026-02-24",
    itemCount: 3,
    priority: "high",
    status: "sent"
  }
];

const mockRfqDetails: Record<string, RfqDetail> = {
  "RFQ-24071": {
    id: "RFQ-24071",
    customerId: "c-1",
    customerName: "Acme Fabrication",
    projectName: "Plant Expansion Piping",
    receivedAt: "2026-02-21T09:20:00.000Z",
    dueDate: "2026-02-25",
    keyNotes: "Need fastest ETA. FOB preferred. Confirm weight per meter.",
    sourceFiles: [
      { id: "f-1", name: "RFQ_Email_Thread.eml", type: "email" },
      { id: "f-2", name: "Pipe_Specs_RevB.pdf", type: "pdf" },
      { id: "f-3", name: "Requested_Line_Items.xlsx", type: "excel" }
    ],
    lineItems: [
      {
        id: "li-1",
        lineNumber: 1,
        description: "Stainless seamless pipe",
        grade: "316L",
        size: '2" SCH40 x 6000mm',
        quantity: 22,
        unit: "lengths",
        requiredDate: "2026-03-05",
        notes: "Sea freight packaging required",
        attachmentsCount: 1,
        matchedSku: "PIPE-316L-2-S40-6M",
        onHand: 980,
        eta: "2026-03-02",
        confidence: 0.86
      },
      {
        id: "li-2",
        lineNumber: 2,
        description: "SS angle",
        grade: "",
        size: "40x40x4mm x 6m",
        quantity: 140,
        unit: "",
        requiredDate: "2026-03-05",
        notes: "",
        attachmentsCount: 0
      }
    ],
    pricingTerms: {
      subtotal: 0,
      freight: 1200,
      tax: 0,
      fx: 1,
      marginPercent: 12,
      currency: "USD",
      paymentTerms: "Net 30",
      leadTime: "2-3 weeks",
      incoterms: "FOB",
      assumptions: ""
    },
    lastQuotePrice: 24300
  },
  "RFQ-24068": {
    id: "RFQ-24068",
    customerId: "c-2",
    customerName: "North Harbor Energy",
    projectName: "Refinery Maintenance",
    receivedAt: "2026-02-20T14:42:00.000Z",
    dueDate: "2026-02-28",
    keyNotes: "Consolidated shipment accepted. Alternate grades allowed with approval.",
    sourceFiles: [{ id: "f-4", name: "NorthHarbor_RFQ.pdf", type: "pdf" }],
    lineItems: [
      {
        id: "li-3",
        lineNumber: 1,
        description: "Flat bar",
        grade: "304L",
        size: '0.375" x 3" x 144"',
        quantity: 890,
        unit: "pcs",
        requiredDate: "2026-03-08",
        notes: "Low stock trigger",
        attachmentsCount: 0
      }
    ],
    pricingTerms: {
      subtotal: 0,
      freight: 0,
      tax: 0,
      fx: 1,
      marginPercent: 10,
      currency: "USD",
      paymentTerms: "Net 45",
      leadTime: "3-4 weeks",
      incoterms: "EXW",
      assumptions: ""
    },
    lastQuotePrice: 17800
  },
  "RFQ-24063": {
    id: "RFQ-24063",
    customerId: "c-3",
    customerName: "Delta Process Systems",
    projectName: "Food Grade Equipment",
    receivedAt: "2026-02-18T12:10:00.000Z",
    dueDate: "2026-02-24",
    keyNotes: "Sent last revision yesterday. Awaiting customer acknowledgment.",
    sourceFiles: [{ id: "f-5", name: "Delta_Req_Sheet.xlsx", type: "excel" }],
    lineItems: [],
    pricingTerms: {
      subtotal: 0,
      freight: 0,
      tax: 0,
      fx: 1,
      marginPercent: 11,
      currency: "USD",
      paymentTerms: "Net 30",
      leadTime: "2 weeks",
      incoterms: "FOB",
      assumptions: ""
    },
    lastQuotePrice: 15200
  }
};

let mutableDetails = structuredClone(mockRfqDetails);

export async function listRfqs(status: QueueStatus, filters: QueueFilters): Promise<RfqCard[]> {
  // TODO: map to existing queue list function/API.
  await sleep(220);
  return mockRfqs.filter((rfq) => {
    if (rfq.status !== status) return false;
    if (filters.status !== "all" && rfq.status !== filters.status) return false;
    if (filters.customer && !rfq.customerName.toLowerCase().includes(filters.customer.toLowerCase())) return false;
    if (filters.dueDate && rfq.dueDate !== filters.dueDate) return false;
    return true;
  });
}

export async function getRfq(rfqId: string): Promise<RfqDetail | null> {
  // TODO: map to existing RFQ detail fetcher.
  await sleep(260);
  return mutableDetails[rfqId] ? structuredClone(mutableDetails[rfqId]) : null;
}

export async function saveDraft(rfqId: string, quoteState: RfqDetail): Promise<{ ok: true; savedAt: string }> {
  // TODO: map to existing save draft function/API.
  await sleep(300);
  mutableDetails[rfqId] = structuredClone(quoteState);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function generateQuote(rfqId: string): Promise<{ ok: true; message: string }> {
  // TODO: map to existing quote PDF/doc generation function.
  await sleep(240);
  return { ok: true, message: `Quote PDF prepared for ${rfqId}` };
}

export async function sendQuote(rfqId: string): Promise<{ ok: true; message: string }> {
  // TODO: map to existing outbound quote sender.
  await sleep(320);
  return { ok: true, message: `Quote sent for ${rfqId}` };
}

export async function getLastQuoteComparison(customerId: string, items: LineItem[]): Promise<LastQuoteComparison> {
  // TODO: map to existing historical quote comparison function.
  await sleep(180);
  const baseline = 15000 + items.length * 1200 + customerId.length * 70;
  const latest = baseline * 1.043;
  return {
    lastPrice: baseline,
    deltaPercent: ((latest - baseline) / baseline) * 100
  };
}

export async function getInventoryMatch(lineItem: LineItem): Promise<InventoryMatch> {
  // TODO: map to existing inventory matching function.
  await sleep(140);
  return {
    matchedSku: lineItem.matchedSku || `${lineItem.grade || "GEN"}-${lineItem.size || "STD"}`,
    onHand: lineItem.onHand ?? Math.max(0, Math.round(1200 - lineItem.quantity * 2.2)),
    eta: lineItem.eta || "2026-03-04",
    confidence: lineItem.confidence ?? 0.72
  };
}

export async function getRiskFlags(lineItem: LineItem): Promise<RiskFlag[]> {
  // TODO: map to existing risk model function.
  await sleep(120);
  const flags: RiskFlag[] = [];
  if (!lineItem.grade || !lineItem.unit) flags.push({ type: "spec", label: "Spec ambiguity", level: "high" });
  if (lineItem.quantity > 500) flags.push({ type: "delivery", label: "Capacity pressure", level: "medium" });
  if ((lineItem.confidence ?? 0.7) < 0.75) flags.push({ type: "commercial", label: "Pricing variance", level: "medium" });
  if (!flags.length) flags.push({ type: "delivery", label: "Risk normal", level: "low" });
  return flags;
}
