import { NextResponse } from "next/server";
import { readData, writeData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";
import { InventoryItem } from "@/lib/types";

const toNum = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ sku: string }> }) {
  const auth = await requireRole(req, ["inventory_manager", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const { sku } = await params;
  const decodedSku = decodeURIComponent(sku);
  const body = await req.json().catch(() => ({} as Partial<InventoryItem>));

  const data = await readData();
  const idx = data.inventory.findIndex((item) => item.sku === decodedSku);
  if (idx < 0) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

  const current = data.inventory[idx];
  const next: InventoryItem = {
    ...current,
    category: String(body.category ?? current.category),
    grade: String(body.grade ?? current.grade).toUpperCase(),
    finish: String(body.finish ?? current.finish).toUpperCase(),
    thickness: toNum(body.thickness, current.thickness),
    width: toNum(body.width, current.width),
    length: toNum(body.length, current.length),
    weightPerUnit: toNum(body.weightPerUnit, current.weightPerUnit),
    basePrice: toNum(body.basePrice, current.basePrice),
    qtyOnHand: toNum(body.qtyOnHand, current.qtyOnHand),
    nominalSize: body.nominalSize !== undefined ? toNum(body.nominalSize, current.nominalSize ?? 0) : current.nominalSize,
    schedule: body.schedule !== undefined ? String(body.schedule || "") : current.schedule,
    specText: body.specText !== undefined ? String(body.specText || "") : current.specText
  };

  data.inventory[idx] = next;
  await writeData(data);
  return NextResponse.json({ ok: true, item: next });
}
