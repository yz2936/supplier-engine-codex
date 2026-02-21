import { NextResponse } from "next/server";
import { mutateData, readData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";
import { Quote } from "@/lib/types";

export async function GET(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const data = await readData();
  const quotes = auth.user.role === "sales_manager"
    ? data.quotes
    : data.quotes.filter((q) => q.createdByUserId === auth.user.id);

  return NextResponse.json({ quotes: quotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}

export async function POST(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const quote: Quote = {
    id: crypto.randomUUID(),
    customerName: String(body.customerName ?? "Unknown Customer"),
    createdByUserId: auth.user.id,
    itemsQuoted: body.itemsQuoted ?? [],
    totalPrice: Number(body.totalPrice ?? 0),
    status: (body.status ?? "Draft") as Quote["status"],
    createdAt: new Date().toISOString()
  };

  await mutateData((data) => {
    data.quotes.push(quote);
  });

  return NextResponse.json({ ok: true, quote });
}
