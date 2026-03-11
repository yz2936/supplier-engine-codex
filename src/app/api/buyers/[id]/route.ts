import { NextResponse } from "next/server";
import { mutateData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();

  const updated = await mutateData((data) => {
    const buyer = data.buyers.find((b) => b.id === id && b.assignedManagerUserId === auth.user.id);
    if (!buyer) return null;

    if (typeof body.notes === "string") buyer.notes = body.notes;
    if (body.status && ["New", "Active", "Dormant"].includes(body.status)) buyer.status = body.status;
    buyer.updatedAt = new Date().toISOString();

    return buyer;
  });

  if (!updated) {
    return NextResponse.json({ error: "Buyer not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, buyer: updated });
}
