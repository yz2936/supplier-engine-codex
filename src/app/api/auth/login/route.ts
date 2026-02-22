import { NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/server-auth";
import { mutateData } from "@/lib/data-store";
import { normalizeEmail, verifyPassword } from "@/lib/security";

const missingPersistentDb = () => Boolean(process.env.VERCEL && !process.env.DATABASE_URL?.trim());

export async function POST(req: Request) {
  try {
    if (missingPersistentDb()) {
      return NextResponse.json({
        error: "Persistent storage is not configured. Set DATABASE_URL in Vercel environment variables."
      }, { status: 503 });
    }

    const body = await req.json();
    const email = normalizeEmail(String(body.email ?? ""));
    const password = String(body.password ?? "").trim();

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    const result = await mutateData((data) => {
      const user = data.users.find((u) => u.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return { ok: false as const, status: 401 as const, error: "Invalid credentials" };
      }

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
    return NextResponse.json({ error: "Auth service temporarily unavailable. Please retry." }, { status: 503 });
  }
}
