import { AppData, AppUser, BuyerProfile } from "@/lib/types";

const salesRoutingRoles = new Set(["sales_rep", "sales_manager"]);

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

export const parseRoutingUserIdFromAddress = (toEmailRaw: string) => {
  const email = extractEmailAddress(toEmailRaw);
  const hit = email.match(/^[^@+]+\+slroute-([^@]+)@/i);
  return hit?.[1] ?? null;
};

export const buildRoutingAddress = (baseAddressRaw: string, user: Pick<AppUser, "id">) => {
  const baseAddress = extractEmailAddress(baseAddressRaw);
  const [local, domain] = baseAddress.split("@");
  if (!local || !domain) return "";
  return `${local}+slroute-${user.id}@${domain}`;
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
    const found = data.users.find((u) => u.id === bySubject && salesRoutingRoles.has(u.role));
    if (found) return found;
  }

  const byAddress = parseRoutingUserIdFromAddress(toEmailRaw);
  if (byAddress) {
    const found = data.users.find((u) => u.id === byAddress && salesRoutingRoles.has(u.role));
    if (found) return found;
  }

  const toEmail = normalizeLocalPart(extractEmailAddress(toEmailRaw));
  const exact = data.users.find((u) => normalizeLocalPart(u.email) === toEmail && salesRoutingRoles.has(u.role));
  if (exact) return exact;

  return data.users.find((u) => u.role === "sales_manager")
    ?? data.users.find((u) => salesRoutingRoles.has(u.role))
    ?? null;
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
