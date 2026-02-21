import { NextResponse } from "next/server";
import { mutateData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();

  const updated = await mutateData((data) => {
    const quote = data.quotes.find((q) => q.id === id);
    if (!quote) return { kind: "not_found" as const };

    if (auth.user.role !== "sales_manager" && quote.createdByUserId !== auth.user.id) {
      return { kind: "forbidden" as const };
    }

    if (body.status) quote.status = body.status;
    return { kind: "ok" as const, quote };
  });

  if (updated.kind === "not_found") {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (updated.kind === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, quote: updated.quote });
}
