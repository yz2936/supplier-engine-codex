import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppData, AppUser, UserEmailImapSettings, UserEmailPopSettings, UserEmailSettings, UserEmailSmtpSettings } from "@/lib/types";

const EMAIL_SECRET = process.env.EMAIL_CREDENTIAL_SECRET?.trim()
  || process.env.SESSION_SECRET?.trim()
  || process.env.APP_STATE_KEY?.trim()
  || "stainless-email-secret";

const keyFromSecret = (secret: string) => createHash("sha256").update(secret).digest();

const getKey = () => keyFromSecret(EMAIL_SECRET);

const isTrue = (value: string | undefined, fallback: boolean) => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

export const encryptSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
};

export const decryptSecret = (payload: string) => {
  const [ivB64, tagB64, encryptedB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) return "";
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const encrypted = Buffer.from(encryptedB64, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
};

const smtpFromEnv = () => {
  const host = process.env.SMTP_HOST?.trim() || "";
  const user = process.env.SMTP_USER?.trim() || "";
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user, pass },
    from: process.env.SMTP_FROM?.trim() || user
  };
};

const smtpFromUserSettings = (data: AppData, userId: string) => {
  const user = data.users.find((u) => u.id === userId);
  const smtp = user?.emailSettings?.smtp;
  if (!smtp?.host || !smtp.user || !smtp.passEncrypted) return null;
  return {
    host: smtp.host,
    port: Number(smtp.port || 587),
    secure: Boolean(smtp.secure),
    auth: {
      user: smtp.user.trim(),
      pass: decryptSecret(smtp.passEncrypted)
    },
    from: (smtp.from || smtp.user || user?.email || "").trim()
  };
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

const imapFromEnv = () => {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const host = process.env.IMAP_HOST?.trim() || inferImapHostFromSmtp(smtpHost) || "imap.gmail.com";
  const user = process.env.IMAP_USER?.trim() || process.env.SMTP_USER?.trim() || "";
  const pass = (process.env.IMAP_PASS || process.env.SMTP_PASS || "").replace(/\s+/g, "");
  if (!user || !pass) return null;
  return {
    host,
    port: Number(process.env.IMAP_PORT || 993),
    secure: String(process.env.IMAP_SECURE || "true").toLowerCase() === "true",
    auth: { user, pass },
    rejectUnauthorized: isTrue(process.env.IMAP_TLS_REJECT_UNAUTHORIZED, !isTrue(process.env.IMAP_ALLOW_SELF_SIGNED, false))
  };
};

const popFromEnv = () => {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const host = process.env.POP_HOST?.trim()
    || (process.env.POP_USER || process.env.POP_PASS ? inferImapHostFromSmtp(smtpHost).replace(/^imap\./, "pop.") : "")
    || "";
  const user = process.env.POP_USER?.trim() || process.env.SMTP_USER?.trim() || "";
  const pass = (process.env.POP_PASS || process.env.SMTP_PASS || "").replace(/\s+/g, "");
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.POP_PORT || 995),
    secure: String(process.env.POP_SECURE || "true").toLowerCase() === "true",
    auth: { user, pass },
    rejectUnauthorized: isTrue(process.env.POP_TLS_REJECT_UNAUTHORIZED, !isTrue(process.env.POP_ALLOW_SELF_SIGNED, false))
  };
};

export const getSmtpConfigForUser = (data: AppData, userId: string) => {
  return smtpFromUserSettings(data, userId) || smtpFromEnv();
};

export const getStableSmtpConfigForUser = (data: AppData, userId: string) => {
  return smtpFromEnv() || smtpFromUserSettings(data, userId);
};

export const getImapConfigForUser = (data: AppData, userId: string) => {
  const user = data.users.find((u) => u.id === userId);
  const imap = user?.emailSettings?.imap;
  if (imap?.host && imap.user && imap.passEncrypted) {
    return {
      host: imap.host,
      port: Number(imap.port || 993),
      secure: Boolean(imap.secure),
      auth: {
        user: imap.user.trim(),
        pass: decryptSecret(imap.passEncrypted)
      },
      rejectUnauthorized: imap.rejectUnauthorized ?? true
    };
  }
  return imapFromEnv();
};

export const getPopConfigForUser = (data: AppData, userId: string) => {
  const user = data.users.find((u) => u.id === userId);
  const pop = user?.emailSettings?.pop;
  if (pop?.host && pop.user && pop.passEncrypted) {
    return {
      host: pop.host,
      port: Number(pop.port || 995),
      secure: Boolean(pop.secure),
      auth: {
        user: pop.user.trim(),
        pass: decryptSecret(pop.passEncrypted)
      },
      rejectUnauthorized: pop.rejectUnauthorized ?? true
    };
  }
  return popFromEnv();
};

export const sanitizeUserEmailSettingsForApi = (settings?: UserEmailSettings) => {
  return {
    configured: Boolean(settings?.smtp?.host || settings?.imap?.host || settings?.pop?.host),
    updatedAt: settings?.updatedAt,
    inboundProtocol: settings?.inboundProtocol || (settings?.pop ? "pop" : "imap"),
    smtp: settings?.smtp
      ? {
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.secure,
        user: settings.smtp.user,
        from: settings.smtp.from
      }
      : null,
    imap: settings?.imap
      ? {
        host: settings.imap.host,
        port: settings.imap.port,
        secure: settings.imap.secure,
        user: settings.imap.user,
        rejectUnauthorized: settings.imap.rejectUnauthorized
      }
      : null,
    pop: settings?.pop
      ? {
        host: settings.pop.host,
        port: settings.pop.port,
        secure: settings.pop.secure,
        user: settings.pop.user,
        rejectUnauthorized: settings.pop.rejectUnauthorized
      }
      : null
  };
};

const withSmtp = (current: UserEmailSettings | undefined, smtp: UserEmailSmtpSettings) => ({
  ...(current || { updatedAt: new Date().toISOString() }),
  smtp,
  updatedAt: new Date().toISOString()
});

const withImap = (current: UserEmailSettings | undefined, imap: UserEmailImapSettings) => ({
  ...(current || { updatedAt: new Date().toISOString() }),
  imap,
  inboundProtocol: "imap" as const,
  updatedAt: new Date().toISOString()
});

const withPop = (current: UserEmailSettings | undefined, pop: UserEmailPopSettings) => ({
  ...(current || { updatedAt: new Date().toISOString() }),
  pop,
  inboundProtocol: "pop" as const,
  updatedAt: new Date().toISOString()
});

export const saveUserEmailSettings = (
  user: AppUser,
  payload: {
    smtp: { host: string; port: number; secure: boolean; user: string; pass?: string; from?: string };
    imap?: { host: string; port: number; secure: boolean; user: string; pass?: string; rejectUnauthorized?: boolean };
    pop?: { host: string; port: number; secure: boolean; user: string; pass?: string; rejectUnauthorized?: boolean };
    inboundProtocol?: "imap" | "pop";
  }
) => {
  const nextSmtp: UserEmailSmtpSettings = {
    host: payload.smtp.host.trim(),
    port: Number(payload.smtp.port || 587),
    secure: Boolean(payload.smtp.secure),
    user: payload.smtp.user.trim().toLowerCase(),
    passEncrypted: payload.smtp.pass
      ? encryptSecret(payload.smtp.pass)
      : (user.emailSettings?.smtp?.passEncrypted || ""),
    from: payload.smtp.from?.trim() || payload.smtp.user.trim().toLowerCase()
  };

  const nextSettings = withSmtp(user.emailSettings, nextSmtp);

  if (payload.inboundProtocol === "pop" && payload.pop) {
    const nextPop: UserEmailPopSettings = {
      host: payload.pop.host.trim(),
      port: Number(payload.pop.port || 995),
      secure: Boolean(payload.pop.secure),
      user: payload.pop.user.trim().toLowerCase(),
      passEncrypted: payload.pop.pass
        ? encryptSecret(payload.pop.pass)
        : (user.emailSettings?.pop?.passEncrypted || ""),
      rejectUnauthorized: payload.pop.rejectUnauthorized ?? true
    };
    user.emailSettings = withPop(nextSettings, nextPop);
    return;
  }

  if (payload.imap) {
    const nextImap: UserEmailImapSettings = {
      host: payload.imap.host.trim(),
      port: Number(payload.imap.port || 993),
      secure: Boolean(payload.imap.secure),
      user: payload.imap.user.trim().toLowerCase(),
      passEncrypted: payload.imap.pass
        ? encryptSecret(payload.imap.pass)
        : (user.emailSettings?.imap?.passEncrypted || ""),
      rejectUnauthorized: payload.imap.rejectUnauthorized ?? true
    };
    user.emailSettings = withImap(nextSettings, nextImap);
    return;
  }

  user.emailSettings = { ...nextSettings, inboundProtocol: user.emailSettings?.inboundProtocol || "imap" };
};

export const clearUserEmailSettings = (user: AppUser) => {
  delete user.emailSettings;
};
