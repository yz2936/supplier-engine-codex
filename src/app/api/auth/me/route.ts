import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
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
}
