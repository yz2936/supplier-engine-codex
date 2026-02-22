import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const data = await readData();
    return NextResponse.json(
      { inventory: data.inventory },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch {
    return NextResponse.json({ error: "Inventory service temporarily unavailable. Please retry." }, { status: 503 });
  }
}
