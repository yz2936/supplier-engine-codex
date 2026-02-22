import { NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/server-auth";
import { mutateData } from "@/lib/data-store";
import { hashPassword, normalizeEmail } from "@/lib/security";
import { UserRole } from "@/lib/types";

const validRoles: UserRole[] = ["sales_rep", "inventory_manager", "sales_manager"];
const hasDb = () => Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || process.env.POSTGRES_PRISMA_URL?.trim() || process.env.SUPABASE_DATABASE_URL?.trim());
const missingPersistentDb = () => Boolean(process.env.VERCEL && !hasDb());

export async function POST(req: Request) {
  try {
    if (missingPersistentDb()) {
      return NextResponse.json({
        error: "Persistent storage is not configured. Set one of DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL, or SUPABASE_DATABASE_URL in Vercel environment variables."
      }, { status: 503 });
    }

    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const email = normalizeEmail(String(body.email ?? ""));
    const password = String(body.password ?? "").trim();
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

      data.users.push(user);
      return { ok: true as const, user };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { user } = result;
    const { token, expiresAt } = await createSession(user.id);

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: user.companyName,
        onboarded: user.onboarded,
        createdAt: user.createdAt
      }
    });
    setSessionCookie(res, token, expiresAt, user);
    return res;
  } catch {
    return NextResponse.json({ error: "Registration service temporarily unavailable. Please retry." }, { status: 503 });
  }
}
