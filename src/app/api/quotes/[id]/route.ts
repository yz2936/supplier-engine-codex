import { NextResponse } from "next/server";
import { readData, writeData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();

  const data = await readData();
  const quote = data.quotes.find((q) => q.id === id);
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  if (auth.user.role !== "sales_manager" && quote.createdByUserId !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (body.status) quote.status = body.status;
  await writeData(data);

  return NextResponse.json({ ok: true, quote });
}
