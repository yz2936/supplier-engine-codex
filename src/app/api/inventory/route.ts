import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { requireUser } from "@/lib/server-auth";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const data = await readData();
  return NextResponse.json({ inventory: data.inventory });
}
