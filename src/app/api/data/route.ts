import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";

export async function GET() {
  const data = await readData();
  return NextResponse.json({
    inventory: data.inventory,
    surcharges: data.surcharges,
    quotes: data.quotes
  });
}
