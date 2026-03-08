import { NextResponse } from "next/server";
import { applyConversationCommand, discardQuoteSession, saveQuoteDraftSession } from "@/lib/quote-agent";
import { mutateData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager", "inventory_manager"]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({} as { action?: string; marginPercent?: number }));
    const action = String(body.action ?? "").trim();
    const marginPercent = typeof body.marginPercent === "number" ? body.marginPercent : null;

    const session = await mutateData(async (data) => {
      const index = data.quoteAgentSessions.findIndex((candidate) => candidate.id === id && candidate.createdByUserId === auth.user.id);
      if (index === -1) throw new Error("Quote session not found");

      if (action === "save") {
        const saved = saveQuoteDraftSession(data, auth.user, data.quoteAgentSessions[index]);
        data.quoteAgentSessions[index] = saved;
        return saved;
      }

      if (action === "update_margin") {
        const next = await applyConversationCommand(
          data,
          auth.user,
          data.quoteAgentSessions[index],
          `Set margin to ${marginPercent ?? data.quoteAgentSessions[index].marginPercent ?? 12}%`
        );
        data.quoteAgentSessions[index] = next;
        return next;
      }

      throw new Error("Unsupported quote session action");
    });

    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Session update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager", "inventory_manager"]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const session = await mutateData(async (data) => {
      const index = data.quoteAgentSessions.findIndex((candidate) => candidate.id === id && candidate.createdByUserId === auth.user.id);
      if (index === -1) throw new Error("Quote session not found");
      const discarded = discardQuoteSession(data.quoteAgentSessions[index]);
      data.quoteAgentSessions[index] = discarded;
      return discarded;
    });

    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discard failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
