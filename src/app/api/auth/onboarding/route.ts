import { NextResponse } from "next/server";
import { readData, writeData } from "@/lib/data-store";
import { requireUser } from "@/lib/server-auth";
import { UserRole } from "@/lib/types";

const validRoles: UserRole[] = ["sales_rep", "inventory_manager", "sales_manager"];

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const name = String(body.name ?? auth.user.name).trim();
  const companyName = String(body.companyName ?? "").trim();
  const role = body.role as UserRole;

  if (!name || !companyName || !validRoles.includes(role)) {
    return NextResponse.json({ error: "name, companyName, and valid role are required" }, { status: 400 });
  }

  const data = await readData();
  const user = data.users.find((u) => u.id === auth.user.id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  user.name = name;
  user.companyName = companyName;
  user.role = role;
  user.onboarded = true;

  await writeData(data);
  return NextResponse.json({
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
}
