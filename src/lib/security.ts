import { createHash, timingSafeEqual } from "node:crypto";

export const hashPassword = (password: string) => createHash("sha256").update(password).digest("hex");

export const verifyPassword = (password: string, expectedHash: string) => {
  const actualHash = hashPassword(password);
  const a = Buffer.from(actualHash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
