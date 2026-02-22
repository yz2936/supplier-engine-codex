export type UserRole = "sales_rep" | "inventory_manager" | "sales_manager";

export type StockStatus = "green" | "yellow" | "red";

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
  finish?: string;
  nominalSize?: number;
  schedule?: string;
  dimensionSummary?: string;
  thickness?: number;
  width?: number;
  length?: number;
  quantity: number;
  quantityUnit: "pcs" | "lbs";
  rawSpec: string;
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
  unit: "pcs" | "lbs";
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
  unit: "pcs" | "lbs";
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
};

export type AppData = {
  inventory: InventoryItem[];
  surcharges: Surcharge[];
  quotes: Quote[];
  manufacturers: Manufacturer[];
  sourcingRequests: SourcingRequest[];
  users: AppUser[];
  sessions: Session[];
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

export type UserEmailSettings = {
  smtp?: UserEmailSmtpSettings;
  imap?: UserEmailImapSettings;
  updatedAt: string;
};
