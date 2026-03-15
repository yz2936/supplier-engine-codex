export type UserRole = "sales_rep" | "inventory_manager" | "sales_manager";

export type StockStatus = "green" | "yellow" | "red";

export type QuantityUnit =
  | "pcs"
  | "pieces"
  | "ea"
  | "each"
  | "lengths"
  | "spools"
  | "sets"
  | "lot"
  | "lbs"
  | "kg"
  | "ft"
  | "m"
  | "unknown";

export type InventoryItem = {
  sku: string;
  category: string;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  finish: string;
  weightPerUnit: number;
  basePrice: number;
  qtyOnHand: number;
  nominalSize?: number;
  schedule?: string;
  specText?: string;
};

export type Surcharge = {
  grade: string;
  monthYear: string;
  valuePerLb: number;
};

export type ExtractedLineItem = {
  category: string;
  grade: string;
  productFamily?: string;
  productType?: string;
  finish?: string;
  nominalSize?: number;
  schedule?: string;
  pressureClass?: string;
  endType?: string;
  endTypeSecondary?: string;
  face?: string;
  standards?: string[];
  dimensionSummary?: string;
  thickness?: number;
  width?: number;
  length?: number;
  od?: number;
  id?: number;
  wall?: number;
  angle?: number;
  radius?: string;
  notes?: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  rawSpec: string;
  sourceText?: string;
  confidence?: number;
  estimatedWeightLb?: number;
};

export type MatchResult = {
  requested: ExtractedLineItem;
  inventoryItem?: InventoryItem;
  stockStatus: StockStatus;
  score: number;
  alternatives: InventoryItem[];
};

export type QuoteLine = {
  requested: ExtractedLineItem;
  sku?: string;
  description: string;
  quantity: number;
  unit: QuantityUnit;
  unitPrice: number;
  extendedPrice: number;
  stockStatus: StockStatus;
};

export type Quote = {
  id: string;
  customerName: string;
  createdByUserId: string;
  itemsQuoted: QuoteLine[];
  totalPrice: number;
  status: "Draft" | "Sent" | "Won";
  createdAt: string;
  sentToEmail?: string;
  lastSentAt?: string;
  lastSentSubject?: string;
  contractPdfFileName?: string;
};

export type QuoteWorkflowStage =
  | "idle"
  | "email_selected"
  | "rfq_parsed"
  | "inventory_checked"
  | "draft_ready"
  | "awaiting_approval"
  | "sent"
  | "rejected"
  | "error";

export type QuoteWorkflowStatus = "active" | "saved" | "awaiting_approval" | "completed" | "rejected" | "discarded" | "error";

export type QuoteAgentActivity = {
  id: string;
  at: string;
  actor: "agent" | "user" | "system";
  kind: "step" | "approval_requested" | "approval_granted" | "approval_rejected" | "send" | "error";
  detail: string;
};

export type QuoteConversationMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  at: string;
  content: string;
};

export type QuoteApprovalRequest = {
  id: string;
  type: "send_quote_email" | "finalize_quote" | "commit_pricing_update" | "override_inventory_rule" | "contact_external_party";
  title: string;
  detail: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
};

export type QuoteUiCard =
  | {
    id: string;
    type: "email_preview";
    title: string;
    email: {
      subject: string;
      fromEmail: string;
      receivedAt: string;
      bodyText: string;
      buyerName: string;
      buyerEmail: string;
      attachments?: BuyerMessage["attachments"];
    };
  }
  | {
    id: string;
    type: "rfq_extraction";
    title: string;
    summary: string;
    lineItems: ExtractedLineItem[];
  }
  | {
    id: string;
    type: "inventory_match";
    title: string;
    matches: MatchResult[];
  }
  | {
    id: string;
    type: "quote_preview";
    title: string;
    customerName: string;
    buyerEmail: string;
    lines: QuoteLine[];
    total: number;
    draftSubject: string;
    draftBody: string;
    eta?: string;
  }
  | {
    id: string;
    type: "risk_alert";
    title: string;
    severity: "info" | "warning" | "critical";
    items: string[];
  }
  | {
    id: string;
    type: "approval";
    title: string;
    approval: QuoteApprovalRequest;
  };

export type QuoteAgentSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  status: QuoteWorkflowStatus;
  stage: QuoteWorkflowStage;
  title: string;
  customerName?: string;
  buyerEmail?: string;
  buyerName?: string;
  sourceBuyerId?: string;
  sourceMessageId?: string;
  sourceMessageSubject?: string;
  intakeSourceType?: "buyer_message" | "pasted_email" | "uploaded_files" | "manual_command";
  intakeSourceLabel?: string;
  intakeSourceText?: string;
  intakeSelectionText?: string;
  rfqText?: string;
  marginPercent?: number;
  savedQuoteId?: string;
  savedAt?: string;
  discardedAt?: string;
  messages: QuoteConversationMessage[];
  cards: QuoteUiCard[];
  activities: QuoteAgentActivity[];
  approval?: QuoteApprovalRequest;
  quoteDraft?: {
    lines: QuoteLine[];
    total: number;
    subject: string;
    body: string;
    eta?: string;
  };
};

export type Manufacturer = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  specialties: string[];
  regions?: string[];
  leadTimeDays?: number;
  preferred: boolean;
};

export type SourcingRequestItem = {
  sku?: string;
  productType: string;
  grade: string;
  dimension?: string;
  quantity: number;
  unit: QuantityUnit;
  requestedLength?: number;
  notes?: string;
};

export type SourcingRequest = {
  id: string;
  createdByUserId: string;
  customerName?: string;
  manufacturerId: string;
  manufacturerName: string;
  manufacturerEmail?: string;
  status: "Open" | "Quoted" | "Closed";
  reason: "low_stock" | "out_of_stock" | "new_demand";
  sourceContext: "quote_shortage" | "inventory_restock";
  items: SourcingRequestItem[];
  notes?: string;
  lastEmailedAt?: string;
  lastEmailedByUserId?: string;
  lastEmailSubject?: string;
  createdAt: string;
  updatedAt: string;
};

export type BuyerProfile = {
  id: string;
  companyName: string;
  contactName?: string;
  email: string;
  assignedManagerUserId: string;
  status: "New" | "Active" | "Dormant";
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt: string;
};

export type BuyerMessage = {
  id: string;
  buyerId: string;
  managerUserId: string;
  direction: "inbound" | "outbound";
  sourceMessageId?: string;
  subject: string;
  bodyText: string;
  fromEmail: string;
  toEmail: string;
  receivedAt: string;
  relatedQuoteId?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    kind: "quote_contract_pdf" | "other";
  }>;
};

export type AppData = {
  inventory: InventoryItem[];
  surcharges: Surcharge[];
  quotes: Quote[];
  manufacturers: Manufacturer[];
  sourcingRequests: SourcingRequest[];
  users: AppUser[];
  sessions: Session[];
  quoteAgentSessions: QuoteAgentSession[];
  buyers: BuyerProfile[];
  buyerMessages: BuyerMessage[];
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  onboarded: boolean;
  createdAt: string;
  emailSettings?: UserEmailSettings;
};

export type Session = {
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type UserEmailSmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passEncrypted: string;
  from?: string;
};

export type UserEmailImapSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passEncrypted: string;
  rejectUnauthorized?: boolean;
};

export type UserEmailPopSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passEncrypted: string;
  rejectUnauthorized?: boolean;
};

export type UserEmailSettings = {
  smtp?: UserEmailSmtpSettings;
  imap?: UserEmailImapSettings;
  pop?: UserEmailPopSettings;
  inboundProtocol?: "imap" | "pop";
  updatedAt: string;
};
