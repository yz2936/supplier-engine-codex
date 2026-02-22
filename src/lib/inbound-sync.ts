import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { AppData, AppUser } from "@/lib/types";
import { extractEmailAddress, findManagerForInbound, upsertBuyerProfile } from "@/lib/buyer-routing";
import { filterInboundEmail } from "@/lib/inbound-filter";

type SyncResult = {
  scanned: number;
  created: number;
  skipped: number;
};

const inferImapHostFromSmtp = (smtpHost?: string) => {
  const host = (smtpHost || "").trim().toLowerCase();
  if (!host) return "";
  if (host.includes("gmail.com")) return "imap.gmail.com";
  if (host.includes("office365.com") || host.includes("outlook.com") || host.includes("hotmail.com") || host.includes("live.com")) {
    return "outlook.office365.com";
  }
  if (host.startsWith("smtp.")) return host.replace(/^smtp\./, "imap.");
  return "";
};

const isTrue = (value: string | undefined, fallback: boolean) => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const isCertChainError = (message: string) => /self[-\s]signed certificate|certificate chain/i.test(message);

const inboxConfig = () => {
  const user = process.env.IMAP_USER?.trim() || process.env.SMTP_USER?.trim() || "";
  const pass = (process.env.IMAP_PASS || process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const inferredHost = inferImapHostFromSmtp(process.env.SMTP_HOST?.trim());
  const allowSelfSigned = isTrue(process.env.IMAP_ALLOW_SELF_SIGNED, false);
  const rejectUnauthorized = allowSelfSigned ? false : isTrue(process.env.IMAP_TLS_REJECT_UNAUTHORIZED, true);

  return {
    host: process.env.IMAP_HOST?.trim() || inferredHost || "imap.gmail.com",
    port: Number(process.env.IMAP_PORT || 993),
    secure: String(process.env.IMAP_SECURE || "true").toLowerCase() === "true",
    rejectUnauthorized,
    user,
    pass
  };
};

const textFromParsed = (parsed: Awaited<ReturnType<typeof simpleParser>>) => {
  const text = parsed.text?.trim();
  if (text) return text;
  const html = typeof parsed.html === "string" ? parsed.html : "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

const resolveManager = (
  data: AppData,
  fallback: AppUser,
  to: string,
  subject: string,
  forceCurrentManager: boolean
) => {
  if (forceCurrentManager) return fallback;
  const manager = findManagerForInbound(data, to, subject);
  if (manager?.role === "sales_manager") return manager;
  return fallback;
};

const addressText = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((x): string => addressText(x)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const obj = value as { text?: string; value?: Array<{ name?: string; address?: string }> };
    if (obj.text) return obj.text;
    if (Array.isArray(obj.value)) {
      return obj.value.map((v) => `${v.name ? `${v.name} ` : ""}<${v.address || ""}>`.trim()).join(", ");
    }
  }
  return "";
};

const createClient = (cfg: ReturnType<typeof inboxConfig>, rejectUnauthorized: boolean) => {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized },
    logger: false
  });
};

const syncWithClient = async (
  client: ImapFlow,
  data: AppData,
  fallbackManager: AppUser,
  cfg: ReturnType<typeof inboxConfig>,
  limit: number,
  forceCurrentManager: boolean
): Promise<SyncResult> => {
  let scanned = 0;
  let created = 0;
  let skipped = 0;
  const inboxAddress = extractEmailAddress(process.env.INBOUND_ROUTE_ADDRESS?.trim() || cfg.user);

  await client.connect();
  await client.mailboxOpen("INBOX");

  const searchResult = await client.search({ seen: false });
  const uids = Array.isArray(searchResult) ? searchResult : [];
  const newest = uids.slice(Math.max(0, uids.length - Math.max(1, limit)));

  for (const uid of newest) {
    scanned += 1;
    const message = await client.fetchOne(uid, {
      uid: true,
      source: true,
      envelope: true,
      internalDate: true
    });
    if (!message || !message.source) {
      skipped += 1;
      continue;
    }

    const parsed = await simpleParser(message.source as Buffer);
    const from = addressText(parsed.from).trim();
    const to = addressText(parsed.to).trim() || cfg.user;
    const subject = (parsed.subject || message.envelope?.subject || "Buyer Reply").trim();
    const bodyText = textFromParsed(parsed);
    const fromEmail = extractEmailAddress(from);
    const toEmail = extractEmailAddress(to || cfg.user);
    const sourceMessageId = (parsed.messageId || "").trim() || `uid-${uid}`;
    const receivedAtSource = parsed.date || message.internalDate || new Date();
    const receivedAt = receivedAtSource instanceof Date
      ? receivedAtSource.toISOString()
      : new Date(receivedAtSource).toISOString();

    if (!fromEmail || !bodyText) {
      skipped += 1;
      continue;
    }
    const decision = await filterInboundEmail(subject, bodyText);
    if (!decision.accept) {
      skipped += 1;
      continue;
    }
    if (fromEmail === inboxAddress || fromEmail === extractEmailAddress(cfg.user)) {
      skipped += 1;
      continue;
    }
    const alreadyStored = data.buyerMessages.some((m) => m.sourceMessageId && m.sourceMessageId === sourceMessageId);
    if (alreadyStored) {
      skipped += 1;
      continue;
    }

    const manager = resolveManager(data, fallbackManager, toEmail || inboxAddress, subject, forceCurrentManager);
    const buyer = upsertBuyerProfile(data, manager.id, from);
    data.buyerMessages.push({
      id: crypto.randomUUID(),
      sourceMessageId,
      buyerId: buyer.id,
      managerUserId: manager.id,
      direction: "inbound",
      subject,
      bodyText,
      fromEmail,
      toEmail: toEmail || inboxAddress,
      receivedAt
    });
    buyer.status = "Active";
    buyer.lastInteractionAt = new Date().toISOString();
    buyer.updatedAt = new Date().toISOString();
    created += 1;
  }

  return { scanned, created, skipped };
};

export const syncInboundMailboxForManager = async (
  data: AppData,
  fallbackManager: AppUser,
  limit = 25,
  forceCurrentManager = true
): Promise<SyncResult> => {
  const cfg = inboxConfig();
  if (!cfg.user || !cfg.pass) {
    throw new Error(
      "Inbound mailbox is not configured. In Vercel set IMAP_USER + IMAP_PASS (or reuse SMTP_USER + SMTP_PASS), plus IMAP_HOST/IMAP_PORT/IMAP_SECURE as needed."
    );
  }

  const runSync = async (rejectUnauthorized: boolean) => {
    const client = createClient(cfg, rejectUnauthorized);
    try {
      return await syncWithClient(client, data, fallbackManager, cfg, limit, forceCurrentManager);
    } finally {
      await client.logout().catch(() => undefined);
    }
  };

  try {
    return await runSync(cfg.rejectUnauthorized);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (cfg.rejectUnauthorized && isCertChainError(message)) {
      return runSync(false);
    }
    if (isCertChainError(message)) {
      throw new Error(
        "Inbound mailbox TLS validation failed. Set IMAP_ALLOW_SELF_SIGNED=true if your mail provider uses a custom certificate chain."
      );
    }
    throw err;
  }
};
