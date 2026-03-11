import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";
import { filterInboundEmail } from "@/lib/inbound-filter";

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

  const acceptedInboundIds: string[] = [];
  let inboundTotal = 0;
  let inboundAccepted = 0;

  for (const m of messages) {
    if (m.direction !== "inbound") continue;
    inboundTotal += 1;
    const decision = await filterInboundEmail(m.subject, m.bodyText);
    if (decision.accept) {
      acceptedInboundIds.push(m.id);
      inboundAccepted += 1;
    }
  }

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
