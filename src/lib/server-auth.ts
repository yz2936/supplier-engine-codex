import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { mutateData, readData } from "@/lib/data-store";
import { AppUser, UserRole } from "@/lib/types";

const COOKIE_NAME = "stainless_session";
const STATE_COOKIE_NAME = "stainless_session_state";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SESSION_SECRET = process.env.SESSION_SECRET?.trim() || process.env.APP_STATE_KEY?.trim() || "stainless-dev-secret";

type SessionState = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  onboarded: boolean;
  createdAt: string;
  expiresAt: string;
};

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

const signValue = (value: string) => createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");

const timingSafeEqualString = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};

const encodeState = (state: SessionState) => {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = signValue(payload);
  return `${payload}.${signature}`;
};

const decodeState = (raw: string | undefined): SessionState | null => {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = signValue(payload);
  if (!timingSafeEqualString(signature, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionState;
    const expiresAt = new Date(parsed.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
};



const pruneSessions = (sessions: Array<{ token: string; userId: string; createdAt: string; expiresAt: string }>) => {
  const now = Date.now();
  const sorted = [...sessions]
    .filter((s) => {
      const exp = new Date(s.expiresAt).getTime();
      return Number.isFinite(exp) && exp > now;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const perUser = new Map<string, number>();
  const kept: typeof sessions = [];

  for (const session of sorted) {
    const count = perUser.get(session.userId) ?? 0;
    if (count >= 20) continue;
    if (kept.length >= 1000) break;
    perUser.set(session.userId, count + 1);
    kept.push(session);
  }

  return kept;
};
const toUserSnapshot = (user: AppUser, expiresAt: string): SessionState => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  companyId: user.companyId,
  companyName: user.companyName,
  onboarded: user.onboarded,
  createdAt: user.createdAt,
  expiresAt
});



const fromStateUser = (state: SessionState): AppUser => ({
  id: state.id,
  name: state.name,
  email: state.email,
  role: state.role,
  companyId: state.companyId,
  companyName: state.companyName,
  onboarded: state.onboarded,
  createdAt: state.createdAt,
  passwordHash: ""
});
export const getAuthenticatedUser = async (req: Request): Promise<AppUser | null> => {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  const state = decodeState(cookies[STATE_COOKIE_NAME]);
  const fallbackUser = state ? fromStateUser(state) : null;

  if (token) {
    try {
      const data = await readData();
      const session = data.sessions.find((s) => s.token === token);
      if (session) {
        const expiresAt = new Date(session.expiresAt).getTime();
        if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
          const user = data.users.find((u) => u.id === session.userId);
          if (user) return user;
        } else {
          await mutateData((next) => {
            next.sessions = next.sessions.filter((s) => s.token !== token);
            return null;
          });
        }
      }
    } catch {
      if (fallbackUser) return fallbackUser;
      throw new Error("Auth store unavailable");
    }
  }

  if (!state) return null;

  try {
    const data = await readData();
    const user = data.users.find((u) => u.id === state.id || u.email === state.email);
    if (user) return user;
    return null;
  } catch {
    return fallbackUser;
  }
};

export const requireUser = async (req: Request) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    return { ok: true as const, user };
  } catch {
    return { ok: false as const, response: NextResponse.json({ error: "Auth service temporarily unavailable. Please retry." }, { status: 503 }) };
  }
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
    data.sessions = pruneSessions(data.sessions);
    data.sessions.push({ token, userId, createdAt: now.toISOString(), expiresAt });
    data.sessions = pruneSessions(data.sessions);
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

export const setSessionCookie = (res: NextResponse, token: string, expiresAt: string, user?: AppUser) => {
  const isProd = process.env.NODE_ENV === "production";
  const expires = new Date(expiresAt);

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires
  });

  if (user) {
    const state = encodeState(toUserSnapshot(user, expiresAt));
    res.cookies.set(STATE_COOKIE_NAME, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      path: "/",
      expires
    });
  }
};

export const clearSessionCookie = (res: NextResponse) => {
  const isProd = process.env.NODE_ENV === "production";
  const expired = new Date(0);

  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: expired
  });

  res.cookies.set(STATE_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: expired
  });
};

export const getSessionToken = (req: Request) => parseCookies(req)[COOKIE_NAME] ?? null;
