import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function GET(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const data = await readData();
  const buyers = data.buyers
    .filter((b) => b.assignedManagerUserId === auth.user.id)
    .sort((a, b) => b.lastInteractionAt.localeCompare(a.lastInteractionAt));

  return NextResponse.json({ buyers });
}
