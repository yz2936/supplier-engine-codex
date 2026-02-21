import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { readData, writeData } from "@/lib/data-store";
import { createLlmClient, normalizeProvider } from "@/lib/llm-provider";
import { requireUser } from "@/lib/server-auth";
import { Manufacturer } from "@/lib/types";

type ChatAction =
  | { type: "set_margin"; value: number }
  | { type: "set_customer"; value: string }
  | { type: "set_buyer_email"; value: string }
  | { type: "set_rfq"; value: string; mode: "replace" | "append" }
  | { type: "parse_quote" }
  | { type: "save_quote" };

type ChatContext = {
  customerName?: string;
  buyerEmail?: string;
  rfqText?: string;
  marginPercent?: number;
  lineCount?: number;
  stockSummary?: { green: number; yellow: number; red: number };
};

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const smtpConfig = () => ({
  host: process.env.SMTP_HOST?.trim(),
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  auth: process.env.SMTP_USER && process.env.SMTP_PASS
    ? {
      user: process.env.SMTP_USER.trim(),
      pass: process.env.SMTP_PASS.replace(/\s+/g, "")
    }
    : undefined
});

const suggestMargin = (context: ChatContext, message: string) => {
  const source = `${message}\n${context.rfqText ?? ""}`.toLowerCase();
  let value = 12;
  const reasons: string[] = [];

  if (/\b(253ma|2205|duplex|super\s*duplex|904l|alloy)\b/i.test(source)) {
    value += 3;
    reasons.push("Specialty/alloy material complexity");
  }
  if (/\b(rush|urgent|asap|earliest eta|expedite)\b/i.test(source)) {
    value += 2;
    reasons.push("Urgent lead-time request");
  }
  if (context.stockSummary && (context.stockSummary.red > 0 || context.stockSummary.yellow > 0)) {
    value += 2;
    reasons.push("Inventory availability risk");
  }
  if (/\b(fob|cif|ddp|sea freight|air freight|export)\b/i.test(source)) {
    value += 1;
    reasons.push("Logistics/terms complexity");
  }
  if (/\b(high volume|bulk|repeat order)\b/i.test(source)) {
    value -= 2;
    reasons.push("Potential volume discount");
  }

  return {
    recommended: Math.max(6, Math.min(30, value)),
    reasons: reasons.length ? reasons : ["Standard baseline margin for typical RFQ complexity"]
  };
};

const evaluateLogistics = (input: string) => {
  const source = input.toLowerCase();
  const found: string[] = [];
  const missing: string[] = [];

  if (/\b(fob|cif|cnf|exw|dap|ddp)\b/i.test(source)) found.push("Incoterm");
  else missing.push("Incoterm (FOB/CIF/EXW/...)");

  if (/\b(eta|lead time|delivery|ship(?:ping)? date)\b/i.test(source)) found.push("Delivery timeline");
  else missing.push("Delivery timeline / ETA");

  if (/\b(sea freight|air freight|truck|courier|vessel)\b/i.test(source)) found.push("Transport mode");
  else missing.push("Transport mode (sea/air/truck)");

  if (/\b(packed|packaging|crate|pallet)\b/i.test(source)) found.push("Packaging instruction");
  else missing.push("Packaging instruction");

  if (/\b(destination|port|warehouse|address)\b/i.test(source)) found.push("Destination");
  else missing.push("Destination / Port");

  return { found, missing };
};

const parseSupplierCreateIntent = (message: string) => {
  if (!/(add|create|new)\s+(supplier|manufacturer)/i.test(message)) return null;

  const email = (message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "").toLowerCase();
  if (!looksLikeEmail(email)) return null;

  const nameMatch = message.match(/(?:supplier|manufacturer)\s*(?:name)?\s*(?:is|=|:)\s*([a-z0-9 .&'\/-]{2,120})/i);
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  const name = (nameMatch?.[1] || local || "New Supplier").trim();

  const specialtiesMatch = message.match(/specialt(?:y|ies)\s*(?:is|=|:)\s*([a-z0-9, .&\/-]{2,200})/i);
  const specialties = specialtiesMatch
    ? specialtiesMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
    : ["General"];

  const leadMatch = message.match(/lead\s*time(?:\s*days?)?\s*(?:is|=|:)?\s*(\d{1,3})/i);
  const leadTimeDays = leadMatch ? Number(leadMatch[1]) : undefined;
  const preferred = /\bpreferred\b/i.test(message);

  return { name, email, specialties, leadTimeDays, preferred };
};

const parseSupplierEmailIntent = (message: string) => {
  if (!/(email|send).*(supplier|manufacturer)|(supplier|manufacturer).*(email|send)/i.test(message)) return null;
  const to = (message.match(/\bto\s*:\s*([^\s,;]+)/i)?.[1] || message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "").toLowerCase();
  if (!looksLikeEmail(to)) return null;

  const subject = (message.match(/\bsubject\s*:\s*([^\n]+)/i)?.[1] || "Sourcing Request").trim();
  const bodyMatch = message.match(/\b(?:body|message)\s*:\s*([\s\S]+)/i);
  const text = (bodyMatch?.[1] || "Hello, please share your quote, lead time, and MOQ for the requested industrial products. Thank you.").trim();

  return { to, subject, text };
};

const extractActions = (message: string, uploadedFile?: { kind: "inventory_file" | "rfq_text"; text?: string }) => {
  const actions: ChatAction[] = [];
  const lower = message.toLowerCase();

  const marginMatch = message.match(/margin(?:\s*(?:to|=))?\s*(\d{1,2}(?:\.\d+)?)\s*%?/i);
  if (marginMatch) actions.push({ type: "set_margin", value: Number(marginMatch[1]) });

  const customerMatch = message.match(/customer(?:\s+is|\s*=|:)\s*([a-z0-9 .&'-]{2,80})/i);
  if (customerMatch) actions.push({ type: "set_customer", value: customerMatch[1].trim() });

  const buyerEmailMatch = message.match(/\b(?:buyer\s*email|email)(?:\s+is|\s*=|:)\s*([^\s,;]+)/i);
  if (buyerEmailMatch && looksLikeEmail(buyerEmailMatch[1])) {
    actions.push({ type: "set_buyer_email", value: buyerEmailMatch[1].trim().toLowerCase() });
  }

  const replaceRfqMatch = message.match(/(?:replace|set)\s+(?:the\s+)?rfq(?:\s+to)?\s*:\s*([\s\S]+)/i);
  if (replaceRfqMatch) actions.push({ type: "set_rfq", value: replaceRfqMatch[1].trim(), mode: "replace" });

  const appendRfqMatch = message.match(/(?:append|add)\s+(?:to\s+)?(?:the\s+)?rfq\s*:\s*([\s\S]+)/i);
  if (appendRfqMatch) actions.push({ type: "set_rfq", value: appendRfqMatch[1].trim(), mode: "append" });

  const asksToParse = /(parse|match|price|quote this|run quote|generate quote|analyze rfq|analyze spec|analyze specification)/i.test(lower);
  if (uploadedFile?.kind === "rfq_text" && asksToParse && uploadedFile.text) {
    actions.push({ type: "set_rfq", value: uploadedFile.text, mode: "replace" });
  }
  if (asksToParse) actions.push({ type: "parse_quote" });

  if (/(save|log)\s+(?:this\s+)?quote/i.test(lower)) actions.push({ type: "save_quote" });

  return actions;
};

const safeParseJson = (raw: string) => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || raw.trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
};

const sanitizeAction = (action: unknown): ChatAction | null => {
  if (!action || typeof action !== "object") return null;
  const raw = action as Record<string, unknown>;
  const type = String(raw.type ?? "");

  if (type === "set_margin") {
    const value = Number(raw.value);
    if (!Number.isFinite(value)) return null;
    return { type: "set_margin", value: Math.max(0, Math.min(80, value)) };
  }
  if (type === "set_customer") {
    const value = String(raw.value ?? "").trim();
    if (!value) return null;
    return { type: "set_customer", value };
  }
  if (type === "set_buyer_email") {
    const value = String(raw.value ?? "").trim().toLowerCase();
    if (!looksLikeEmail(value)) return null;
    return { type: "set_buyer_email", value };
  }
  if (type === "set_rfq") {
    const value = String(raw.value ?? "").trim();
    const mode = raw.mode === "append" ? "append" : "replace";
    if (!value) return null;
    return { type: "set_rfq", value, mode };
  }
  if (type === "parse_quote" || type === "save_quote") return { type };

  return null;
};

const dedupeActions = (actions: ChatAction[]) => {
  const map = new Map<string, ChatAction>();
  for (const action of actions) {
    const key = action.type === "set_margin"
      ? `${action.type}:${action.value}`
      : action.type === "set_customer"
        ? `${action.type}:${action.value}`
        : action.type === "set_buyer_email"
          ? `${action.type}:${action.value}`
          : action.type === "set_rfq"
            ? `${action.type}:${action.mode}:${action.value}`
            : action.type;
    map.set(key, action);
  }
  return Array.from(map.values());
};

const llmAssist = async (params: {
  provider: "openai" | "deepseek";
  message: string;
  context: ChatContext;
  uploadedFile?: { kind: "inventory_file" | "rfq_text"; text?: string; name?: string };
}) => {
  const clientConfig = createLlmClient(params.provider);
  if (!clientConfig) {
    return {
      reply: "",
      actions: [] as ChatAction[],
      warning: params.provider === "deepseek"
        ? "DeepSeek is not configured. Set DEEPSEEK_API_KEY in environment variables."
        : "OpenAI is not configured. Set OPENAI_API_KEY in environment variables."
    };
  }

  const prompt = [
    "You are an industrial procurement copilot for metal/stainless sourcing teams.",
    "Return ONLY valid JSON with this schema:",
    '{"reply":"string","actions":[{"type":"set_margin","value":number}|{"type":"set_customer","value":"string"}|{"type":"set_buyer_email","value":"email"}|{"type":"set_rfq","value":"string","mode":"replace|append"}|{"type":"parse_quote"}|{"type":"save_quote"}]}',
    "Rules:",
    "- Keep reply concise and operations-focused.",
    "- Do not invent credentials.",
    "- Do not invent buyer or supplier emails.",
    "- Use actions only for RFQ workspace updates and quote flow actions."
  ].join("\n");

  const userPayload = JSON.stringify({
    message: params.message,
    context: params.context,
    uploadedFile: params.uploadedFile
      ? {
        kind: params.uploadedFile.kind,
        name: params.uploadedFile.name,
        text: params.uploadedFile.kind === "rfq_text" ? params.uploadedFile.text ?? "" : undefined
      }
      : undefined
  });

  const completion = await clientConfig.client.chat.completions.create({
    model: clientConfig.model,
    temperature: 0.2,
    max_tokens: 500,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userPayload }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return {
      reply: `I could not parse a structured response from ${clientConfig.provider}. Falling back to deterministic workflow actions.`,
      actions: [] as ChatAction[]
    };
  }

  const record = parsed as Record<string, unknown>;
  const reply = String(record.reply ?? "").trim();
  const actions = Array.isArray(record.actions)
    ? record.actions.map(sanitizeAction).filter((a): a is ChatAction => Boolean(a))
    : [];

  return { reply, actions };
};

const summarizeInventory = async () => {
  const data = await readData();
  const inventory = data.inventory || [];
  const low = inventory.filter((i) => i.qtyOnHand > 0 && i.qtyOnHand < 1000).length;
  const out = inventory.filter((i) => i.qtyOnHand <= 0).length;
  const topGrades = new Map<string, number>();
  for (const row of inventory) {
    const key = (row.grade || "Unknown").trim() || "Unknown";
    topGrades.set(key, (topGrades.get(key) || 0) + 1);
  }
  const top = Array.from(topGrades.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, c]) => `${g} (${c})`);
  return `Inventory analysis: ${inventory.length} SKUs total, ${low} low stock, ${out} out of stock. Top grades: ${top.join(", ") || "n/a"}.`;
};

const assessSupplier = async (message: string) => {
  const data = await readData();
  const email = (message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "").toLowerCase();
  const nameHint = (message.match(/(?:supplier|manufacturer)\s*(?:name)?\s*(?:is|=|:)\s*([a-z0-9 .&'\/-]{2,120})/i)?.[1] || "").trim();

  const supplier = data.manufacturers.find((m) =>
    (email && m.email.toLowerCase() === email)
    || (nameHint && m.name.toLowerCase().includes(nameHint.toLowerCase()))
  ) || data.manufacturers[0];

  if (!supplier) return "No suppliers found in network yet.";

  const reqs = data.sourcingRequests.filter((r) => r.manufacturerId === supplier.id);
  const sent = reqs.filter((r) => Boolean(r.lastEmailedAt)).length;
  const open = reqs.filter((r) => r.status === "Open").length;
  const risk = (supplier.leadTimeDays ?? 0) > 21 ? "elevated" : "normal";
  return `Supplier assessment: ${supplier.name} (${supplier.email}) • preferred=${supplier.preferred ? "yes" : "no"} • lead time=${supplier.leadTimeDays ?? "n/a"}d • sourcing history=${reqs.length} requests, ${sent} emailed, ${open} open • risk=${risk}.`;
};

const addSupplierFromMessage = async (message: string, role: string) => {
  if (!["sales_rep", "inventory_manager", "sales_manager"].includes(role)) {
    return "Your role cannot add suppliers.";
  }
  const parsed = parseSupplierCreateIntent(message);
  if (!parsed) return "To add a supplier, provide at least supplier name/email. Example: Add supplier name: Atlas Stainless, email: rfq@atlas.com, specialties: pipe,tube, lead time: 18.";

  const data = await readData();
  const duplicate = data.manufacturers.some((m) => m.email.toLowerCase() === parsed.email || m.name.toLowerCase() === parsed.name.toLowerCase());
  if (duplicate) return "Supplier already exists (same name or email).";

  if (parsed.preferred) {
    data.manufacturers = data.manufacturers.map((m) => ({ ...m, preferred: false }));
  }

  const supplier: Manufacturer = {
    id: crypto.randomUUID(),
    name: parsed.name,
    email: parsed.email,
    specialties: parsed.specialties.length ? parsed.specialties : ["General"],
    leadTimeDays: parsed.leadTimeDays,
    preferred: parsed.preferred
  };

  data.manufacturers.push(supplier);
  await writeData(data);
  return `Supplier added: ${supplier.name} (${supplier.email}).`;
};

const sendSupplierEmailFromMessage = async (message: string, fromUserEmail: string) => {
  const parsed = parseSupplierEmailIntent(message);
  if (!parsed) {
    return "To send a supplier email, include recipient and optional subject/body. Example: Email supplier to: rfq@vendor.com subject: Pipe RFQ body: Please quote...";
  }

  const cfg = smtpConfig();
  if (!cfg.host) {
    return "SMTP is not configured. Set SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS/SMTP_FROM in environment variables.";
  }

  const transporter = nodemailer.createTransport(cfg);
  const fromAddress = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || "";
  await transporter.sendMail({
    from: fromAddress,
    to: parsed.to,
    subject: parsed.subject,
    text: parsed.text,
    html: `<p>${parsed.text.replace(/\n/g, "<br/>")}</p>`,
    replyTo: fromUserEmail
  });

  return `Supplier email sent to ${parsed.to}.`;
};

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const message = String(body.message ?? "").trim();
  const context = (body.context ?? {}) as ChatContext;
  const llmProvider = normalizeProvider(body.llmProvider);
  const uploadedFile = body.uploadedFile as { kind: "inventory_file" | "rfq_text"; text?: string; name?: string } | undefined;

  if (!message && !uploadedFile) {
    return NextResponse.json({ error: "Message or uploaded file is required" }, { status: 400 });
  }

  const combinedText = `${message}\n${context.rfqText ?? ""}\n${uploadedFile?.text ?? ""}`.trim();
  const wantsLogistics = /(logistics|incoterm|eta|shipping|freight|delivery|transport|packaging)/i.test(message);
  const wantsMarginSuggestion = /(suggest|recommend).*(margin)|margin.*(suggest|recommend)/i.test(message);
  const wantsInventoryAnalysis = /(inventory|stock).*(analysis|analy[sz]e|insight|summary|risk)|analy[sz]e.*(inventory|stock)/i.test(message);
  const wantsSupplierAssessment = /(assess|review|history|risk|performance).*(supplier|manufacturer)|(supplier|manufacturer).*(history|risk|performance)/i.test(message);
  const wantsAddSupplier = /(add|create|new)\s+(supplier|manufacturer)/i.test(message);
  const wantsSupplierEmail = /(email|send).*(supplier|manufacturer)|(supplier|manufacturer).*(email|send)/i.test(message);

  const logistics = wantsLogistics ? evaluateLogistics(combinedText) : undefined;
  const margin = wantsMarginSuggestion ? suggestMargin(context, combinedText) : undefined;

  const heuristicActions = extractActions(message, uploadedFile);

  let llmReply = "";
  let llmActions: ChatAction[] = [];
  let llmWarning: string | undefined;

  try {
    const llm = await llmAssist({ provider: llmProvider, message, context, uploadedFile });
    llmReply = llm.reply;
    llmActions = llm.actions;
    llmWarning = llm.warning;
  } catch (error) {
    llmWarning = error instanceof Error
      ? `${llmProvider} response failed (${error.message}). Falling back to deterministic assistant logic.`
      : `${llmProvider} response failed. Falling back to deterministic assistant logic.`;
  }

  const operationalNotes: string[] = [];

  if (uploadedFile?.kind === "rfq_text" && uploadedFile.name) {
    operationalNotes.push(`Specification document loaded: ${uploadedFile.name}.`);
  }

  if (wantsInventoryAnalysis) {
    operationalNotes.push(await summarizeInventory());
  }

  if (wantsSupplierAssessment) {
    operationalNotes.push(await assessSupplier(message));
  }

  if (wantsAddSupplier) {
    operationalNotes.push(await addSupplierFromMessage(message, auth.user.role));
  }

  if (wantsSupplierEmail) {
    try {
      operationalNotes.push(await sendSupplierEmailFromMessage(message, auth.user.email));
    } catch (error) {
      operationalNotes.push(error instanceof Error ? `Supplier email failed: ${error.message}` : "Supplier email failed.");
    }
  }

  if (logistics) {
    operationalNotes.push(`Logistics check: found ${logistics.found.length ? logistics.found.join(", ") : "none"}.`);
    if (logistics.missing.length) operationalNotes.push(`Missing: ${logistics.missing.join(", ")}.`);
  }

  if (margin) {
    operationalNotes.push(`Recommended margin: ${margin.recommended}% (${margin.reasons.join("; ")}).`);
  }

  if (llmWarning) operationalNotes.push(llmWarning);

  const actions = dedupeActions([...llmActions, ...heuristicActions]);
  const deterministicReply = operationalNotes.join(" ").trim() || "Ready. I can assist with supplier ops, inventory analysis, and specification parsing.";
  const reply = [llmReply, deterministicReply].filter(Boolean).join(" ").trim();

  return NextResponse.json({ reply, actions, logistics, margin, provider: llmProvider });
}
