import { NextResponse } from "next/server";
import { mutateData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "inventory_manager", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({} as { status?: string; notes?: string }));
  const status = String(body.status ?? "").trim();
  const notes = String(body.notes ?? "").trim();

  const result = await mutateData((data) => {
    const idx = data.sourcingRequests.findIndex((r) => r.id === id);
    if (idx < 0) return { ok: false as const, status: 404 as const, error: "Sourcing request not found" };

    const current = data.sourcingRequests[idx];
    if (auth.user.role !== "sales_manager" && current.createdByUserId !== auth.user.id) {
      return { ok: false as const, status: 403 as const, error: "Forbidden" };
    }

    if (status && ["Open", "Quoted", "Closed"].includes(status)) {
      current.status = status as "Open" | "Quoted" | "Closed";
    }
    if (notes) current.notes = notes;
    current.updatedAt = new Date().toISOString();

    data.sourcingRequests[idx] = current;
    return { ok: true as const, request: current };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, request: result.request });
}
