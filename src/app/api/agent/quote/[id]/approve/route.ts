import { NextResponse } from "next/server";
import { approveQuoteSend } from "@/lib/quote-agent";
import { mutateData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager", "inventory_manager"]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const session = await mutateData(async (data) => {
      const index = data.quoteAgentSessions.findIndex((candidate) => candidate.id === id && candidate.createdByUserId === auth.user.id);
      if (index === -1) throw new Error("Quote session not found");
      const approved = await approveQuoteSend(data, auth.user, data.quoteAgentSessions[index]);
      data.quoteAgentSessions[index] = approved;
      return approved;
    });

    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
