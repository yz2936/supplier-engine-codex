import { NextResponse } from "next/server";
import { readData, writeData } from "@/lib/data-store";
import { syncInboundMailboxForManager } from "@/lib/inbound-sync";
import { requireRole } from "@/lib/server-auth";

export async function POST(req: Request) {
  try {
    const auth = await requireRole(req, ["sales_manager"]);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({} as { limit?: number }));
    const limit = Math.max(1, Math.min(100, Number(body?.limit ?? 25)));

    const data = await readData();
    const result = await syncInboundMailboxForManager(data, auth.user, limit);
    await writeData(data);

    return NextResponse.json({
      ok: true,
      ...result,
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
