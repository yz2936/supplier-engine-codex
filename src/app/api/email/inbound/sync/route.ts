import { NextResponse } from "next/server";
import { mutateData } from "@/lib/data-store";
import { syncInboundMailboxForManager, syncRoutingInboxForUser } from "@/lib/inbound-sync";
import { requireRole } from "@/lib/server-auth";

export async function POST(req: Request) {
  try {
    const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({} as { limit?: number; routingMode?: boolean }));
    const limit = Math.max(1, Math.min(100, Number(body?.limit ?? 25)));
    const routingMode = body?.routingMode !== false;

    const result = await mutateData(async (data) => {
      if (routingMode) {
        return syncRoutingInboxForUser(data, auth.user, limit);
      }
      return syncInboundMailboxForManager(data, auth.user, limit);
    });

    return NextResponse.json({
      ok: true,
      ...result,
      routingMode,
      filter: {
        enabled: String(process.env.INBOUND_LLM_FILTER ?? "true").toLowerCase() !== "false",
        model: process.env.INBOUND_FILTER_MODEL?.trim() || "gpt-4o-mini"
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync inbound mailbox";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
