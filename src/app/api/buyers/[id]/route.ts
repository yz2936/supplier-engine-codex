import { NextResponse } from "next/server";
import { readData, writeData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_manager"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const data = await readData();
  const buyer = data.buyers.find((b) => b.id === id && b.assignedManagerUserId === auth.user.id);
  if (!buyer) return NextResponse.json({ error: "Buyer not found" }, { status: 404 });

  if (typeof body.notes === "string") buyer.notes = body.notes;
  if (body.status && ["New", "Active", "Dormant"].includes(body.status)) buyer.status = body.status;
  buyer.updatedAt = new Date().toISOString();

  await writeData(data);
  return NextResponse.json({ ok: true, buyer });
}
