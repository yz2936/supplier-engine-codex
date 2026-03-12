import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import net from "node:net";
import tls from "node:tls";
import { AppData, AppUser } from "@/lib/types";
import { extractEmailAddress, findManagerForInbound, upsertBuyerProfile } from "@/lib/buyer-routing";
import { getImapConfigForUser, getPopConfigForUser } from "@/lib/user-email-config";

type SyncResult = {
  scanned: number;
  created: number;
  skipped: number;
};

const isCertChainError = (message: string) => /self[-\s]signed certificate|certificate chain/i.test(message);

type PopConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  rejectUnauthorized: boolean;
};

const textFromParsed = (parsed: Awaited<ReturnType<typeof simpleParser>>) => {
  const text = parsed.text?.trim();
  if (text) return text;
  const html = typeof parsed.html === "string" ? parsed.html : "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

const extractForwardedField = (label: string, text: string) => {
  const patterns = [
    new RegExp(`^${label}:\\s*(.+)$`, "im"),
    new RegExp(`^-+\\s*${label}:\\s*(.+)$`, "im")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
};

const extractForwardedMessage = (subject: string, text: string) => {
  const normalized = text.replace(/\r\n/g, "\n");
  const forwardedMarker = /-{2,}\s*forwarded message\s*-{2,}|begin forwarded message|from:\s.+\n(?:date|sent):/i;
  if (!/^fw:|^fwd:/i.test(subject) && !forwardedMarker.test(normalized)) return null;

  const forwardedFrom = extractForwardedField("From", normalized);
  const forwardedSubject = extractForwardedField("Subject", normalized);
  const bodyStart = normalized.search(/^(?:hello|hi|dear|\s*$|\d+\s*(?:pcs|ea|ft|m)\b|qty\b|quotation\b|rfq\b)/im);
  const forwardedBody = bodyStart >= 0 ? normalized.slice(bodyStart).trim() : normalized.trim();

  return {
    from: forwardedFrom,
    subject: forwardedSubject || subject.replace(/^fwd?:\s*/i, "").trim(),
    bodyText: forwardedBody
  };
};

const normalizeInboundSource = (params: {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  inboxUser: string;
}) => {
  const { from, to, subject, bodyText } = params;
  const forwarded = extractForwardedMessage(subject, bodyText);
  const effectiveFrom = forwarded?.from?.trim() || from;
  const effectiveSubject = forwarded?.subject?.trim() || subject;
  const effectiveBodyText = forwarded?.bodyText?.trim() || bodyText;
  return {
    from: effectiveFrom,
    to,
    subject: effectiveSubject,
    bodyText: effectiveBodyText,
    fromEmail: extractEmailAddress(effectiveFrom),
    toEmail: extractEmailAddress(to || params.inboxUser)
  };
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
  if (manager && (manager.role === "sales_manager" || manager.role === "sales_rep")) return manager;
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

const createClient = (
  cfg: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    rejectUnauthorized: boolean;
  },
  rejectUnauthorized: boolean
) => {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.auth.user, pass: cfg.auth.pass },
    tls: { rejectUnauthorized },
    logger: false
  });
};

const connectImapMailbox = async (
  cfg: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    rejectUnauthorized: boolean;
  },
  rejectUnauthorized: boolean
) => {
  const client = createClient(cfg, rejectUnauthorized);
  await client.connect();
  await client.mailboxOpen("INBOX");
  return client;
};

class Pop3Client {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer = "";
  private pending = Promise.resolve();

  constructor(private readonly cfg: PopConfig, private readonly rejectUnauthorized: boolean) {}

  async connect() {
    const socket = this.cfg.secure
      ? tls.connect({
        host: this.cfg.host,
        port: this.cfg.port,
        rejectUnauthorized: this.rejectUnauthorized
      })
      : net.connect({
        host: this.cfg.host,
        port: this.cfg.port
      });

    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      this.buffer += chunk;
    });

    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.once("connect", () => resolve());
      if (this.cfg.secure) {
        socket.once("secureConnect", () => resolve());
      }
    });

    await this.readLine();
  }

  private async waitForData() {
    await new Promise<void>((resolve, reject) => {
      const socket = this.socket;
      if (!socket) return reject(new Error("POP socket is not connected"));
      const onData = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
      };
      socket.on("data", onData);
      socket.once("error", onError);
    });
  }

  private async readLine() {
    while (!this.buffer.includes("\r\n")) {
      await this.waitForData();
    }
    const index = this.buffer.indexOf("\r\n");
    const line = this.buffer.slice(0, index);
    this.buffer = this.buffer.slice(index + 2);
    return line;
  }

  private async readMultiline() {
    let payload = "";
    while (!payload.includes("\r\n.\r\n")) {
      await this.waitForData();
      payload += this.buffer;
      this.buffer = "";
    }
    const endIndex = payload.indexOf("\r\n.\r\n");
    const content = payload.slice(0, endIndex);
    const remainder = payload.slice(endIndex + 5);
    this.buffer = remainder + this.buffer;
    return content
      .split("\r\n")
      .map((line) => line.startsWith("..") ? line.slice(1) : line)
      .join("\r\n");
  }

  private async enqueue<T>(task: () => Promise<T>) {
    const run = this.pending.then(task, task);
    this.pending = run.then(() => undefined, () => undefined);
    return run;
  }

  async command(command: string, multiline = false) {
    return this.enqueue(async () => {
      const socket = this.socket;
      if (!socket) throw new Error("POP socket is not connected");
      socket.write(`${command}\r\n`);
      const line = await this.readLine();
      if (!line.startsWith("+OK")) throw new Error(line || `POP command failed: ${command}`);
      if (!multiline) return line;
      return this.readMultiline();
    });
  }

  async login() {
    await this.command(`USER ${this.cfg.auth.user}`);
    await this.command(`PASS ${this.cfg.auth.pass}`);
  }

  async listUids() {
    const data = await this.command("UIDL", true);
    return data
      .split("\r\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [messageNumber, uid] = line.split(/\s+/, 2);
        return { messageNumber: Number(messageNumber), uid: uid || `msg-${messageNumber}` };
      })
      .filter((item) => Number.isFinite(item.messageNumber) && item.messageNumber > 0);
  }

  async retrieve(messageNumber: number) {
    const data = await this.command(`RETR ${messageNumber}`, true);
    return Buffer.from(data, "utf8");
  }

  async quit() {
    if (!this.socket) return;
    try {
      await this.command("QUIT");
    } catch {
      // noop
    } finally {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

const syncWithClient = async (
  client: ImapFlow,
  data: AppData,
  fallbackManager: AppUser,
  cfg: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    rejectUnauthorized: boolean;
  },
  limit: number,
  forceCurrentManager: boolean
): Promise<SyncResult> => {
  let scanned = 0;
  let created = 0;
  let skipped = 0;
  const inboxAddress = extractEmailAddress(process.env.INBOUND_ROUTE_ADDRESS?.trim() || cfg.auth.user);

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
    const normalized = normalizeInboundSource({
      from: addressText(parsed.from).trim(),
      to: addressText(parsed.to).trim() || cfg.auth.user,
      subject: (parsed.subject || message.envelope?.subject || "Buyer Reply").trim(),
      bodyText: textFromParsed(parsed),
      inboxUser: cfg.auth.user
    });
    const sourceMessageId = (parsed.messageId || "").trim() || `uid-${uid}`;
    const receivedAtSource = parsed.date || message.internalDate || new Date();
    const receivedAt = receivedAtSource instanceof Date
      ? receivedAtSource.toISOString()
      : new Date(receivedAtSource).toISOString();

    if (!normalized.fromEmail || !normalized.bodyText) {
      skipped += 1;
      continue;
    }
    if (normalized.fromEmail === inboxAddress || normalized.fromEmail === extractEmailAddress(cfg.auth.user)) {
      skipped += 1;
      continue;
    }
    const alreadyStored = data.buyerMessages.some((m) => m.sourceMessageId && m.sourceMessageId === sourceMessageId);
    if (alreadyStored) {
      skipped += 1;
      continue;
    }

    const manager = resolveManager(data, fallbackManager, normalized.toEmail || inboxAddress, normalized.subject, forceCurrentManager);
    const buyer = upsertBuyerProfile(data, manager.id, normalized.from);
    data.buyerMessages.push({
      id: crypto.randomUUID(),
      sourceMessageId,
      buyerId: buyer.id,
      managerUserId: manager.id,
      direction: "inbound",
      subject: normalized.subject,
      bodyText: normalized.bodyText,
      fromEmail: normalized.fromEmail,
      toEmail: normalized.toEmail || inboxAddress,
      receivedAt
    });
    buyer.status = "Active";
    buyer.lastInteractionAt = new Date().toISOString();
    buyer.updatedAt = new Date().toISOString();
    created += 1;
  }

  return { scanned, created, skipped };
};

const syncWithPopClient = async (
  client: Pop3Client,
  data: AppData,
  fallbackManager: AppUser,
  cfg: PopConfig,
  limit: number,
  forceCurrentManager: boolean
): Promise<SyncResult> => {
  let scanned = 0;
  let created = 0;
  let skipped = 0;
  const inboxAddress = extractEmailAddress(process.env.INBOUND_ROUTE_ADDRESS?.trim() || cfg.auth.user);

  await client.connect();
  await client.login();
  const uids = await client.listUids();
  const newest = uids.slice(Math.max(0, uids.length - Math.max(1, limit)));

  for (const item of newest) {
    scanned += 1;
    const sourceMessageId = item.uid || `pop-${item.messageNumber}`;
    const alreadyStored = data.buyerMessages.some((m) => m.sourceMessageId && m.sourceMessageId === sourceMessageId);
    if (alreadyStored) {
      skipped += 1;
      continue;
    }

    const source = await client.retrieve(item.messageNumber);
    const parsed = await simpleParser(source);
    const normalized = normalizeInboundSource({
      from: addressText(parsed.from).trim(),
      to: addressText(parsed.to).trim() || cfg.auth.user,
      subject: (parsed.subject || "Buyer Reply").trim(),
      bodyText: textFromParsed(parsed),
      inboxUser: cfg.auth.user
    });
    const receivedAtSource = parsed.date || new Date();
    const receivedAt = receivedAtSource instanceof Date
      ? receivedAtSource.toISOString()
      : new Date(receivedAtSource).toISOString();

    if (!normalized.fromEmail || !normalized.bodyText) {
      skipped += 1;
      continue;
    }
    if (normalized.fromEmail === inboxAddress || normalized.fromEmail === extractEmailAddress(cfg.auth.user)) {
      skipped += 1;
      continue;
    }

    const manager = resolveManager(data, fallbackManager, normalized.toEmail || inboxAddress, normalized.subject, forceCurrentManager);
    const buyer = upsertBuyerProfile(data, manager.id, normalized.from);
    data.buyerMessages.push({
      id: crypto.randomUUID(),
      sourceMessageId,
      buyerId: buyer.id,
      managerUserId: manager.id,
      direction: "inbound",
      subject: normalized.subject,
      bodyText: normalized.bodyText,
      fromEmail: normalized.fromEmail,
      toEmail: normalized.toEmail || inboxAddress,
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
  const inboundProtocol = data.users.find((u) => u.id === fallbackManager.id)?.emailSettings?.inboundProtocol || "imap";
  const imapCfg = inboundProtocol === "imap" ? getImapConfigForUser(data, fallbackManager.id) : null;
  const popCfg = inboundProtocol === "pop" ? getPopConfigForUser(data, fallbackManager.id) : null;
  const cfg = inboundProtocol === "pop" ? popCfg : imapCfg;
  if (!cfg?.auth?.user || !cfg?.auth?.pass) {
    throw new Error(
      "Inbound mailbox is not configured. Go to Settings -> Email Integration and connect your SMTP plus IMAP or POP account."
    );
  }

  const runSync = async (rejectUnauthorized: boolean) => {
    if (inboundProtocol === "pop") {
      const client = new Pop3Client(cfg as PopConfig, rejectUnauthorized);
      try {
        return await syncWithPopClient(client, data, fallbackManager, cfg as PopConfig, limit, forceCurrentManager);
      } finally {
        await client.quit().catch(() => undefined);
      }
    }

    const client = createClient(cfg as {
      host: string;
      port: number;
      secure: boolean;
      auth: { user: string; pass: string };
      rejectUnauthorized: boolean;
    }, rejectUnauthorized);
    try {
      return await syncWithClient(client, data, fallbackManager, cfg as {
        host: string;
        port: number;
        secure: boolean;
        auth: { user: string; pass: string };
        rejectUnauthorized: boolean;
      }, limit, forceCurrentManager);
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
        `Inbound ${inboundProtocol.toUpperCase()} mailbox TLS validation failed. Allow self-signed certificates only if your mail provider uses a custom certificate chain.`
      );
    }
    throw err;
  }
};

export const syncRoutingInboxForUser = async (
  data: AppData,
  fallbackUser: AppUser,
  limit = 25
): Promise<SyncResult> => {
  const imapCfg = getImapConfigForUser(data, "__platform__");
  const popCfg = getPopConfigForUser(data, "__platform__");
  const inboundProtocol = imapCfg ? "imap" : popCfg ? "pop" : "imap";
  const cfg = inboundProtocol === "pop" ? popCfg : imapCfg;

  if (!cfg?.auth?.user || !cfg?.auth?.pass) {
    throw new Error(
      "Routing inbox is not configured. Set platform IMAP/POP environment variables and INBOUND_ROUTE_ADDRESS."
    );
  }

  const runSync = async (rejectUnauthorized: boolean) => {
    if (inboundProtocol === "pop") {
      const client = new Pop3Client(cfg as PopConfig, rejectUnauthorized);
      try {
        return await syncWithPopClient(client, data, fallbackUser, cfg as PopConfig, limit, false);
      } finally {
        await client.quit().catch(() => undefined);
      }
    }

    const client = createClient(cfg as {
      host: string;
      port: number;
      secure: boolean;
      auth: { user: string; pass: string };
      rejectUnauthorized: boolean;
    }, rejectUnauthorized);
    try {
      return await syncWithClient(client, data, fallbackUser, cfg as {
        host: string;
        port: number;
        secure: boolean;
        auth: { user: string; pass: string };
        rejectUnauthorized: boolean;
      }, limit, false);
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
        `Routing inbox ${inboundProtocol.toUpperCase()} TLS validation failed. Allow self-signed certificates only if your proxy mailbox uses a custom certificate chain.`
      );
    }
    throw err;
  }
};

export const verifyInboundMailboxConnection = async (params: {
  protocol: "imap" | "pop";
  config: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    rejectUnauthorized: boolean;
  };
}) => {
  const { protocol, config } = params;

  const runProbe = async (rejectUnauthorized: boolean) => {
    if (protocol === "pop") {
      const client = new Pop3Client(config, rejectUnauthorized);
      try {
        await client.connect();
        await client.login();
        return "POP mailbox connected.";
      } finally {
        await client.quit().catch(() => undefined);
      }
    }

    const client = await connectImapMailbox(config, rejectUnauthorized);
    try {
      return "IMAP mailbox connected.";
    } finally {
      await client.logout().catch(() => undefined);
    }
  };

  try {
    return await runProbe(config.rejectUnauthorized);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (config.rejectUnauthorized && isCertChainError(message)) {
      return runProbe(false);
    }
    if (isCertChainError(message)) {
      throw new Error(
        `Inbound ${protocol.toUpperCase()} mailbox TLS validation failed. Allow self-signed certificates only if your mail provider uses a custom certificate chain.`
      );
    }
    throw err;
  }
};
