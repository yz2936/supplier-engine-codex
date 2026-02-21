import { AppData, AppUser, BuyerProfile } from "@/lib/types";

export const extractEmailAddress = (raw: string) => {
  const v = raw.trim();
  const angle = v.match(/<([^>]+)>/);
  return (angle?.[1] ?? v).trim().toLowerCase();
};

export const extractDisplayName = (raw: string) => {
  const v = raw.trim();
  const angle = v.match(/^(.+?)\s*<[^>]+>$/);
  return angle?.[1]?.replace(/^"|"$/g, "").trim() || undefined;
};

export const parseManagerIdFromSubject = (subject: string) => {
  const hit = subject.match(/\[#SLMGR:([a-zA-Z0-9_-]+)\]/);
  return hit?.[1] ?? null;
};

const normalizeLocalPart = (email: string) => {
  const [local, domain] = email.toLowerCase().split("@");
  if (!domain) return email.toLowerCase();
  const cleanLocal = local.split("+")[0];
  return `${cleanLocal}@${domain}`;
};

export const findManagerForInbound = (data: AppData, toEmailRaw: string, subject: string): AppUser | null => {
  const bySubject = parseManagerIdFromSubject(subject);
  if (bySubject) {
    const found = data.users.find((u) => u.id === bySubject && u.role === "sales_manager");
    if (found) return found;
  }

  const toEmail = normalizeLocalPart(extractEmailAddress(toEmailRaw));
  const exact = data.users.find((u) => normalizeLocalPart(u.email) === toEmail && u.role === "sales_manager");
  if (exact) return exact;

  return data.users.find((u) => u.role === "sales_manager") ?? null;
};

export const upsertBuyerProfile = (
  data: AppData,
  managerUserId: string,
  fromRaw: string,
  companyFallback?: string
): BuyerProfile => {
  const email = extractEmailAddress(fromRaw);
  const name = extractDisplayName(fromRaw);
  const now = new Date().toISOString();
  const companyName = companyFallback?.trim() || name || email.split("@")[0];

  let buyer = data.buyers.find((b) => b.email.toLowerCase() === email.toLowerCase());
  if (!buyer) {
    buyer = {
      id: crypto.randomUUID(),
      companyName,
      contactName: name,
      email,
      assignedManagerUserId: managerUserId,
      status: "New",
      notes: "",
      createdAt: now,
      updatedAt: now,
      lastInteractionAt: now
    };
    data.buyers.push(buyer);
  } else {
    buyer.assignedManagerUserId = managerUserId;
    if (!buyer.contactName && name) buyer.contactName = name;
    buyer.lastInteractionAt = now;
    buyer.updatedAt = now;
  }

  return buyer;
};
