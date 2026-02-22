import { NextResponse } from "next/server";
import { mutateData } from "@/lib/data-store";
import { parseInventoryFile } from "@/lib/inventory-file";
import { requireRole } from "@/lib/server-auth";

export async function POST(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "inventory_manager", "sales_manager"]);
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

  await mutateData((data) => {
    data.inventory = parsed;
    return null;
  });

  return NextResponse.json({ ok: true, count: parsed.length });
}
