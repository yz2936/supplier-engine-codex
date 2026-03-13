import { NextResponse } from "next/server";
import { identifyRfqItems } from "@/lib/item-identification";
import { requireRole } from "@/lib/server-auth";

export async function POST(req: Request) {
  try {
    const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({} as { emailText?: string; attachmentText?: string }));
    const emailText = String(body.emailText ?? "").trim();
    const attachmentText = String(body.attachmentText ?? "").trim();

    if (!emailText && !attachmentText) {
      return NextResponse.json({ error: "Email or attachment text is required" }, { status: 400 });
    }

    const result = await identifyRfqItems({ emailText, attachmentText });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Item identification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
