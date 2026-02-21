import { NextResponse } from "next/server";
import { mutateData, readData } from "@/lib/data-store";
import { requireUser, requireRole } from "@/lib/server-auth";
import { monthYear } from "@/lib/utils";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const data = await readData();
  return NextResponse.json({ surcharges: data.surcharges });
}

export async function POST(req: Request) {
  const auth = await requireRole(req, ["inventory_manager", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const grade = String(body.grade ?? "").toUpperCase();
  const valuePerLb = Number(body.valuePerLb ?? 0);
  const month = String(body.monthYear ?? monthYear());

  if (!grade) {
    return NextResponse.json({ error: "grade is required" }, { status: 400 });
  }

  const surcharges = await mutateData((data) => {
    const idx = data.surcharges.findIndex((s) => s.grade === grade && s.monthYear === month);
    if (idx >= 0) data.surcharges[idx].valuePerLb = valuePerLb;
    else data.surcharges.push({ grade, monthYear: month, valuePerLb });
    return data.surcharges;
  });

  return NextResponse.json({ ok: true, surcharges });
}
