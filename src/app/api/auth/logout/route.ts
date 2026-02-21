import { NextResponse } from "next/server";
import { clearSessionCookie, destroySession, getSessionToken } from "@/lib/server-auth";

export async function POST(req: Request) {
  const token = getSessionToken(req);
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
