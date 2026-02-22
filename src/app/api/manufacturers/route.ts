import { NextResponse } from "next/server";
import { mutateData, readData } from "@/lib/data-store";
import { requireRole, requireUser } from "@/lib/server-auth";
import { Manufacturer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const sortManufacturers = (items: Manufacturer[]) => [...items].sort((a, b) => {
  if (a.preferred === b.preferred) return a.name.localeCompare(b.name);
  return a.preferred ? -1 : 1;
});

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const data = await readData();
    const manufacturers = sortManufacturers(data.manufacturers);
    return NextResponse.json({ manufacturers }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  } catch {
    return NextResponse.json({ error: "Manufacturer service temporarily unavailable. Please retry." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole(req, ["sales_rep", "inventory_manager", "sales_manager"]);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({} as Partial<Manufacturer>));
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const specialties = Array.isArray(body.specialties)
      ? body.specialties.map((s: unknown) => String(s).trim()).filter(Boolean)
      : String((body as { specialties?: string }).specialties ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const leadTimeRaw = Number(body.leadTimeDays);
    const leadTimeDays = Number.isFinite(leadTimeRaw) && leadTimeRaw > 0 ? leadTimeRaw : undefined;
    const preferred = Boolean(body.preferred);
    const phone = String(body.phone ?? "").trim() || undefined;
    const regions = Array.isArray(body.regions)
      ? body.regions.map((r: unknown) => String(r).trim()).filter(Boolean)
      : undefined;

    if (!name) return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid supplier email is required" }, { status: 400 });
    }

    const result = await mutateData((data) => {
      const duplicate = data.manufacturers.some((m) => m.email.toLowerCase() === email || m.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        return { ok: false as const, error: "Supplier with same name or email already exists", status: 409 as const };
      }

      if (preferred) {
        data.manufacturers = data.manufacturers.map((m) => ({ ...m, preferred: false }));
      }

      const supplier: Manufacturer = {
        id: crypto.randomUUID(),
        name,
        email,
        specialties: specialties.length ? specialties : ["General"],
        leadTimeDays,
        preferred,
        phone,
        regions
      };
      data.manufacturers.push(supplier);

      const manufacturers = sortManufacturers(data.manufacturers);
      return { ok: true as const, supplier, manufacturers };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, manufacturer: result.supplier, manufacturers: result.manufacturers });
  } catch {
    return NextResponse.json({ error: "Failed to save supplier due to temporary service issues. Please retry." }, { status: 503 });
  }
}
