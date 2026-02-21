import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { recommendSurchargeForGrade } from "@/lib/raw-material";
import { requireRole } from "@/lib/server-auth";

export async function GET(req: Request) {
  const auth = await requireRole(req, ["inventory_manager", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const grade = String(searchParams.get("grade") ?? "").trim();
  if (!grade) {
    return NextResponse.json({ error: "grade is required" }, { status: 400 });
  }

  const data = await readData();
  const rec = await recommendSurchargeForGrade(grade, data.surcharges);
  return NextResponse.json({ grade: grade.toUpperCase(), ...rec });
}
