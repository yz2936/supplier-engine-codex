import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { mutateData, readData } from "@/lib/data-store";
import { AppUser, UserRole } from "@/lib/types";

const COOKIE_NAME = "stainless_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const parseCookies = (req: Request) => {
  const raw = req.headers.get("cookie") ?? "";
  const pairs = raw.split(";").map((x) => x.trim()).filter(Boolean);
  const out: Record<string, string> = {};
  for (const p of pairs) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    out[p.slice(0, idx)] = decodeURIComponent(p.slice(idx + 1));
  }
  return out;
};

const cleanExpiredSessions = async () => {
  const now = Date.now();

  await mutateData((data) => {
    data.sessions = data.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
    return null;
  });

  return readData();
};

export const getAuthenticatedUser = async (req: Request): Promise<AppUser | null> => {
  const data = await cleanExpiredSessions();
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const session = data.sessions.find((s) => s.token === token);
  if (!session) return null;

  return data.users.find((u) => u.id === session.userId) ?? null;
};

export const requireUser = async (req: Request) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true as const, user };
};

export const requireRole = async (req: Request, roles: UserRole[]) => {
  const auth = await requireUser(req);
  if (!auth.ok) return auth;
  if (!roles.includes(auth.user.role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
};

export const createSession = async (userId: string) => {
  const token = randomBytes(24).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  await mutateData((data) => {
    data.sessions.push({ token, userId, createdAt: now.toISOString(), expiresAt });
    return null;
  });

  return { token, expiresAt };
};

export const destroySession = async (token: string) => {
  await mutateData((data) => {
    data.sessions = data.sessions.filter((s) => s.token !== token);
    return null;
  });
};

export const setSessionCookie = (res: NextResponse, token: string, expiresAt: string) => {
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: new Date(expiresAt)
  });
};

export const clearSessionCookie = (res: NextResponse) => {
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: new Date(0)
  });
};

export const getSessionToken = (req: Request) => parseCookies(req)[COOKIE_NAME] ?? null;
