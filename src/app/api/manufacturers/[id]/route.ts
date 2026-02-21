import { NextResponse } from "next/server";
import { readData, writeData } from "@/lib/data-store";
import { requireRole } from "@/lib/server-auth";
import { Manufacturer } from "@/lib/types";

const normalizeSpecialties = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "inventory_manager", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({} as Partial<Manufacturer>));
  const data = await readData();
  const index = data.manufacturers.findIndex((m) => m.id === id);
  if (index < 0) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const current = data.manufacturers[index];
  const preferred = body.preferred !== undefined ? Boolean(body.preferred) : current.preferred;
  const next: Manufacturer = {
    ...current,
    name: body.name !== undefined ? String(body.name).trim() || current.name : current.name,
    email: body.email !== undefined ? String(body.email).trim().toLowerCase() || current.email : current.email,
    specialties: body.specialties !== undefined ? normalizeSpecialties(body.specialties) : current.specialties,
    leadTimeDays: body.leadTimeDays !== undefined
      ? (Number.isFinite(Number(body.leadTimeDays)) && Number(body.leadTimeDays) > 0 ? Number(body.leadTimeDays) : undefined)
      : current.leadTimeDays,
    preferred,
    phone: body.phone !== undefined ? String(body.phone).trim() || undefined : current.phone,
    regions: body.regions !== undefined
      ? (Array.isArray(body.regions) ? body.regions.map((r: unknown) => String(r).trim()).filter(Boolean) : undefined)
      : current.regions
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
    return NextResponse.json({ error: "Valid supplier email is required" }, { status: 400 });
  }
  if (!next.specialties.length) next.specialties = ["General"];

  if (preferred) {
    data.manufacturers = data.manufacturers.map((m) => ({ ...m, preferred: m.id === id }));
  }
  data.manufacturers[index] = next;
  await writeData(data);
  return NextResponse.json({ ok: true, manufacturer: next });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["sales_rep", "inventory_manager", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const data = await readData();
  const exists = data.manufacturers.some((m) => m.id === id);
  if (!exists) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const inUse = data.sourcingRequests.some((r) => r.manufacturerId === id && r.status !== "Closed");
  if (inUse) {
    return NextResponse.json({ error: "Supplier is used by open sourcing requests and cannot be removed" }, { status: 409 });
  }

  data.manufacturers = data.manufacturers.filter((m) => m.id !== id);
  if (!data.manufacturers.some((m) => m.preferred) && data.manufacturers[0]) {
    data.manufacturers[0] = { ...data.manufacturers[0], preferred: true };
  }
  await writeData(data);
  return NextResponse.json({ ok: true });
}
