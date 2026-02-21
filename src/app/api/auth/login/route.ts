import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { mutateData } from "@/lib/data-store";
import { setSessionCookie } from "@/lib/server-auth";
import { normalizeEmail, verifyPassword } from "@/lib/security";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export async function POST(req: Request) {
  const body = await req.json();
  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const result = await mutateData((data) => {
    const user = data.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return { ok: false as const, status: 401 as const, error: "Invalid credentials" };
    }

    const now = new Date();
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    data.sessions.push({ token, userId: user.id, createdAt: now.toISOString(), expiresAt });

    return { ok: true as const, user, token, expiresAt };
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { user, token, expiresAt } = result;
  const res = NextResponse.json({ ok: true, user: { ...user, passwordHash: undefined } });
  setSessionCookie(res, token, expiresAt, user);
  return res;
}
