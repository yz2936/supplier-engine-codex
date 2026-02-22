export type QueueStatus = "new" | "in_progress" | "sent";

export type PriorityLevel = "low" | "medium" | "high";

export type SourceFileType = "pdf" | "excel" | "email";

export type SourceFile = {
  id: string;
  name: string;
  type: SourceFileType;
};

export type LineItem = {
  id: string;
  lineNumber: number;
  description: string;
  grade: string;
  size: string;
  quantity: number;
  unit: string;
  requiredDate: string;
  notes: string;
  attachmentsCount: number;
  matchedSku?: string;
  onHand?: number;
  eta?: string;
  confidence?: number;
  supplierCost?: number;
  moq?: number;
  mill?: string;
  finish?: string;
};

export type PricingTerms = {
  subtotal: number;
  freight: number;
  tax: number;
  fx: number;
  marginPercent: number;
  currency: string;
  paymentTerms: string;
  leadTime: string;
  incoterms: string;
  assumptions: string;
  reasonForChange?: string;
};

export type RfqCard = {
  id: string;
  customerId: string;
  customerName: string;
  receivedAt: string;
  dueDate: string;
  itemCount: number;
  priority: PriorityLevel;
  status: QueueStatus;
};

export type RfqDetail = {
  id: string;
  customerId: string;
  customerName: string;
  projectName?: string;
  receivedAt: string;
  dueDate: string;
  keyNotes: string;
  sourceFiles: SourceFile[];
  lineItems: LineItem[];
  pricingTerms: PricingTerms;
  lastQuotePrice?: number;
};

export type QueueFilters = {
  customer: string;
  dueDate: string;
  status: QueueStatus | "all";
};

export type InventoryMatch = {
  matchedSku: string;
  onHand: number;
  eta: string;
  confidence: number;
};

export type RiskFlag = {
  type: "delivery" | "spec" | "commercial";
  label: string;
  level: "low" | "medium" | "high";
};

export type LastQuoteComparison = {
  lastPrice: number;
  deltaPercent: number;
};
