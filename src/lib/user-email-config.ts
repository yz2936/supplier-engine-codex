import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppData, AppUser, UserEmailImapSettings, UserEmailSettings, UserEmailSmtpSettings } from "@/lib/types";

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

export const getSmtpConfigForUser = (data: AppData, userId: string) => {
  const user = data.users.find((u) => u.id === userId);
  const smtp = user?.emailSettings?.smtp;
  if (smtp?.host && smtp.user && smtp.passEncrypted) {
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
  }
  return smtpFromEnv();
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

export const sanitizeUserEmailSettingsForApi = (settings?: UserEmailSettings) => {
  return {
    configured: Boolean(settings?.smtp?.host || settings?.imap?.host),
    updatedAt: settings?.updatedAt,
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
  updatedAt: new Date().toISOString()
});

export const saveUserEmailSettings = (
  user: AppUser,
  payload: {
    smtp: { host: string; port: number; secure: boolean; user: string; pass?: string; from?: string };
    imap?: { host: string; port: number; secure: boolean; user: string; pass?: string; rejectUnauthorized?: boolean };
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

  user.emailSettings = nextSettings;
};
