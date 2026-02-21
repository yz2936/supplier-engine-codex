import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { mutateData } from "@/lib/data-store";
import { setSessionCookie } from "@/lib/server-auth";
import { hashPassword, normalizeEmail } from "@/lib/security";
import { UserRole } from "@/lib/types";

const validRoles: UserRole[] = ["sales_rep", "inventory_manager", "sales_manager"];
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const role = body.role as UserRole;

  if (!name || !email || !password || !validRoles.includes(role)) {
    return NextResponse.json({ error: "name, email, password, and valid role are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const result = await mutateData((data) => {
    if (data.users.some((u) => u.email === email)) {
      return { ok: false as const, status: 409 as const, error: "Email already registered" };
    }

    const now = new Date();
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      role,
      companyId: `c_${crypto.randomUUID().slice(0, 8)}`,
      companyName: "",
      onboarded: false,
      createdAt: now.toISOString()
    };

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

    data.users.push(user);
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
