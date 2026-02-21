import { NextResponse } from "next/server";
import { mutateData, readData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";
import { SourcingRequestItem } from "@/lib/types";

const cleanItems = (raw: unknown): SourcingRequestItem[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      sku: String(row.sku ?? "").trim() || undefined,
      productType: String(row.productType ?? "").trim() || "Unknown",
      grade: String(row.grade ?? "").trim().toUpperCase() || "UNKNOWN",
      dimension: String(row.dimension ?? "").trim() || undefined,
      quantity: Math.max(1, Number(row.quantity ?? 1)),
      unit: String(row.unit ?? "pcs").toLowerCase() === "lbs" ? "lbs" : "pcs",
      requestedLength: Number.isFinite(Number(row.requestedLength)) ? Number(row.requestedLength) : undefined,
      notes: String(row.notes ?? "").trim() || undefined
    } satisfies SourcingRequestItem;
  }).filter((i) => i.productType && i.grade && i.quantity > 0);
};

export async function GET(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "inventory_manager", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const data = await readData();
  const list = data.sourcingRequests
    .filter((r) => auth.user.role === "sales_manager" || r.createdByUserId === auth.user.id)
    .map((r) => {
      const manufacturer = data.manufacturers.find((m) => m.id === r.manufacturerId);
      return {
        ...r,
        manufacturerEmail: manufacturer?.email ?? r.manufacturerEmail
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ requests: list });
}

export async function POST(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "inventory_manager", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const manufacturerId = String(body.manufacturerId ?? "").trim();
  const reason = String(body.reason ?? "new_demand") as "low_stock" | "out_of_stock" | "new_demand";
  const sourceContext = String(body.sourceContext ?? "quote_shortage") as "quote_shortage" | "inventory_restock";
  const customerName = String(body.customerName ?? "").trim() || undefined;
  const notes = String(body.notes ?? "").trim() || undefined;
  const items = cleanItems(body.items);

  if (!manufacturerId) {
    return NextResponse.json({ error: "manufacturerId is required" }, { status: 400 });
  }
  if (!items.length) {
    return NextResponse.json({ error: "At least one sourcing item is required" }, { status: 400 });
  }

  const result = await mutateData((data) => {
    const manufacturer = data.manufacturers.find((m) => m.id === manufacturerId);
    if (!manufacturer) {
      return { ok: false as const, status: 404 as const, error: "Manufacturer not found" };
    }

    const now = new Date().toISOString();
    const request = {
      id: crypto.randomUUID(),
      createdByUserId: auth.user.id,
      customerName,
      manufacturerId: manufacturer.id,
      manufacturerName: manufacturer.name,
      status: "Open" as const,
      reason,
      sourceContext,
      items,
      notes,
      createdAt: now,
      updatedAt: now
    };

    data.sourcingRequests.push(request);
    return { ok: true as const, request };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, request: result.request });
}
