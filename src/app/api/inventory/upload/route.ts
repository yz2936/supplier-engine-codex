import { NextResponse } from "next/server";
import { readData, writeData } from "@/lib/data-store";
import { parseInventoryFile } from "@/lib/inventory-file";
import { requireRole } from "@/lib/server-auth";

export async function POST(req: Request) {
  const auth = await requireRole(req, ["inventory_manager", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No inventory file uploaded" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await parseInventoryFile(file);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to parse inventory file" }, { status: 400 });
  }

  const data = await readData();
  data.inventory = parsed;
  await writeData(data);

  return NextResponse.json({ ok: true, count: parsed.length });
}
