import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { createSession, setSessionCookie } from "@/lib/server-auth";
import { normalizeEmail, verifyPassword } from "@/lib/security";

export async function POST(req: Request) {
  const body = await req.json();
  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const data = await readData();
  const user = data.users.find((u) => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ ok: true, user: { ...user, passwordHash: undefined } });
  setSessionCookie(res, token, expiresAt);
  return res;
}
