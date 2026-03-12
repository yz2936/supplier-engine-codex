import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const data = await readData();
  const buyer = data.buyers.find((b) => b.id === id && b.assignedManagerUserId === auth.user.id);
  if (!buyer) return NextResponse.json({ error: "Buyer not found" }, { status: 404 });

  const messages = data.buyerMessages
    .filter((m) => m.buyerId === id)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

  const acceptedInboundIds = messages.filter((m) => m.direction === "inbound").map((m) => m.id);
  const inboundTotal = acceptedInboundIds.length;
  const inboundAccepted = acceptedInboundIds.length;

  return NextResponse.json({
    ok: true,
    acceptedInboundIds,
    stats: {
      inboundTotal,
      inboundAccepted,
      inboundFilteredOut: inboundTotal - inboundAccepted
    }
  });
}
