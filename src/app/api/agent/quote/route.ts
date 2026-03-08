import { NextResponse } from "next/server";
import { createQuoteAgentSession, applyConversationCommand } from "@/lib/quote-agent";
import { mutateData, readData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function GET(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager", "inventory_manager"]);
  if (!auth.ok) return auth.response;

  const data = await readData();
  const sessions = [...(data.quoteAgentSessions || [])]
    .filter((session) => session.createdByUserId === auth.user.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);

  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager", "inventory_manager"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({} as { sessionId?: string; command?: string }));
    const command = String(body.command ?? "").trim();
    const sessionId = String(body.sessionId ?? "").trim();

    if (!command) {
      return NextResponse.json({ error: "command is required" }, { status: 400 });
    }

    const session = await mutateData(async (data) => {
      if (!sessionId) {
        const created = await createQuoteAgentSession(data, auth.user, command);
        data.quoteAgentSessions = [created, ...(data.quoteAgentSessions || [])].slice(0, 100);
        return created;
      }

      const index = data.quoteAgentSessions.findIndex((candidate) => candidate.id === sessionId && candidate.createdByUserId === auth.user.id);
      if (index === -1) throw new Error("Quote session not found");
      const next = await applyConversationCommand(data, auth.user, data.quoteAgentSessions[index], command);
      data.quoteAgentSessions[index] = next;
      return next;
    });

    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote agent failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
