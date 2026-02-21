import { NextResponse } from "next/server";
import { readData, writeData } from "@/lib/data-store";
import { createSession, setSessionCookie } from "@/lib/server-auth";
import { hashPassword, normalizeEmail } from "@/lib/security";
import { UserRole } from "@/lib/types";

const validRoles: UserRole[] = ["sales_rep", "inventory_manager", "sales_manager"];

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

  const data = await readData();
  if (data.users.some((u) => u.email === email)) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: hashPassword(password),
    role,
    companyId: `c_${crypto.randomUUID().slice(0, 8)}`,
    companyName: "",
    onboarded: false,
    createdAt: new Date().toISOString()
  };

  data.users.push(user);
  await writeData(data);

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ ok: true, user: { ...user, passwordHash: undefined } });
  setSessionCookie(res, token, expiresAt);
  return res;
}
