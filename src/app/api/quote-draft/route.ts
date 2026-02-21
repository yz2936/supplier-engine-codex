import { NextResponse } from "next/server";
import { draftQuoteText } from "@/lib/format";
import { requireRole } from "@/lib/server-auth";

export async function POST(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const customerName = String(body.customerName ?? "Customer");
  const lines = body.lines ?? [];
  const total = Number(body.total ?? 0);

  return NextResponse.json({ draft: draftQuoteText(customerName, lines, total) });
}
