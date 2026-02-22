import { NextResponse } from "next/server";
import { mutateData } from "@/lib/data-store";
import { createSession, requireUser, setSessionCookie } from "@/lib/server-auth";
import { AppUser, UserRole } from "@/lib/types";

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

    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const name = String(body.name ?? auth.user.name).trim();
    const companyName = String(body.companyName ?? "").trim();
    const role = body.role as UserRole;

    if (!name || !companyName || !validRoles.includes(role)) {
      return NextResponse.json({ error: "name, companyName, and valid role are required" }, { status: 400 });
    }

    const result = await mutateData((data) => {
      const user = data.users.find((u) => u.id === auth.user.id || u.email === auth.user.email);
      if (!user) return { ok: false as const, status: 401 as const, error: "Session is no longer valid. Please log in again." };

      user.name = name;
      user.companyName = companyName;
      user.role = role;
      user.onboarded = true;

      return {
        ok: true as const,
        sessionUser: { ...user },
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
      };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { token, expiresAt } = await createSession(result.user.id);
    const res = NextResponse.json({ ok: true, user: result.user });
    setSessionCookie(res, token, expiresAt, result.sessionUser as AppUser);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onboarding service temporarily unavailable. Please retry.";
    const isKnown = message.toLowerCase().includes("database tls validation failed")
      || message.toLowerCase().includes("self-signed certificate")
      || message.toLowerCase().includes("timeout")
      || message.toLowerCase().includes("temporarily unavailable");
    return NextResponse.json({ error: isKnown ? message : "Onboarding service temporarily unavailable. Please retry." }, { status: 503 });
  }
}
