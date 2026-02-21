import { NextResponse } from "next/server";
import { readData } from "@/lib/data-store";
import { findBestMatches } from "@/lib/matcher";
import { parseRFQ } from "@/lib/parser";
import { buildQuoteLines, quoteTotal } from "@/lib/pricing";
import { requireRole } from "@/lib/server-auth";
import { normalizeProvider } from "@/lib/llm-provider";

export async function POST(req: Request) {
  const auth = await requireRole(req, ["sales_rep", "sales_manager"]);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const text = String(body.text ?? "");
  const marginPercent = Number(body.marginPercent ?? 12);
  const llmProvider = normalizeProvider(body.llmProvider);

  if (!text.trim()) {
    return NextResponse.json({ error: "RFQ text is required" }, { status: 400 });
  }

  const data = await readData();
  const extracted = await parseRFQ(text, llmProvider);
  const matches = findBestMatches(extracted, data.inventory);
  const quoteLines = buildQuoteLines(matches, data.surcharges, marginPercent);

  return NextResponse.json({
    extracted,
    matches,
    quoteLines,
    total: quoteTotal(quoteLines)
  });
}
