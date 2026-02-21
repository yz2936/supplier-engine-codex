"use client";

import { useEffect, useRef, useState } from "react";
import { UserRole } from "@/lib/types";
import { LlmProvider } from "@/lib/llm-provider";

type ChatAction =
  | { type: "set_margin"; value: number }
  | { type: "set_customer"; value: string }
  | { type: "set_buyer_email"; value: string }
  | { type: "set_rfq"; value: string; mode: "replace" | "append" }
  | { type: "parse_quote" }
  | { type: "save_quote" };

type Message = { role: "user" | "assistant"; content: string };

type Props = {
  activeView: "dashboard" | "workspace" | "inventory" | "sourcing" | "buyers" | "quotes" | "settings";
  role: UserRole;
  canGenerate: boolean;
  canUpload: boolean;
  compact?: boolean;
  llmProvider: LlmProvider;
  onChangeLlmProvider: (provider: LlmProvider) => void;
  context: {
    customerName: string;
    buyerEmail: string;
    rfqText: string;
    marginPercent: number;
    lineCount: number;
    stockSummary: { green: number; yellow: number; red: number };
  };
  onApplyActions: (actions: ChatAction[]) => Promise<void>;
  onUploadInventoryFile: (file: File) => Promise<string>;
  onNavigateView?: (view: "dashboard" | "workspace" | "inventory" | "sourcing" | "buyers" | "quotes" | "settings") => void;
  onRefreshInventory?: () => Promise<void>;
};

const isTextSpecFile = (name: string) => {
  const n = name.toLowerCase();
  return n.endsWith(".txt") || n.endsWith(".eml") || n.endsWith(".md") || n.endsWith(".rtf") || n.endsWith(".spec") || n.endsWith(".json") || n.endsWith(".xml");
};

const isPdfFile = (name: string) => name.toLowerCase().endsWith(".pdf");

const extractPdfTextFallback = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes);
  const chunks = text.match(/[A-Za-z0-9][A-Za-z0-9 ,.:;()\/#%+\-\n]{18,}/g) || [];
  const joined = chunks.join(" ").replace(/\s+/g, " ").trim();
  return joined.slice(0, 12000);
};

export function AIChatPanel({
  activeView,
  role,
  canGenerate,
  canUpload,
  compact,
  llmProvider,
  onChangeLlmProvider,
  context,
  onApplyActions,
  onUploadInventoryFile,
  onNavigateView,
  onRefreshInventory
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const push = (msg: Message) => setMessages((prev) => [...prev, msg]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const tryRunLocalCommand = async (prompt: string) => {
    const lower = prompt.toLowerCase();
    if (/\b(go to|open|switch to)\b.*\binventory\b/.test(lower)) {
      onNavigateView?.("inventory");
      push({ role: "assistant", content: "Opened Inventory tab." });
      return true;
    }
    if (/\b(go to|open|switch to)\b.*\bsourcing\b/.test(lower)) {
      onNavigateView?.("sourcing");
      push({ role: "assistant", content: "Opened Sourcing tab." });
      return true;
    }
    if (/\b(go to|open|switch to)\b.*\bbuyers?\b/.test(lower)) {
      onNavigateView?.("buyers");
      push({ role: "assistant", content: "Opened Buyers tab." });
      return true;
    }
    if (/\b(go to|open|switch to)\b.*\bworkspace\b/.test(lower)) {
      onNavigateView?.("workspace");
      push({ role: "assistant", content: "Opened Workspace tab." });
      return true;
    }
    if (/\b(go to|open|switch to)\b.*\bdashboard\b/.test(lower)) {
      onNavigateView?.("dashboard");
      push({ role: "assistant", content: "Opened Dashboard tab." });
      return true;
    }
    if (/\b(refresh|reload)\b.*\binventory\b/.test(lower) && onRefreshInventory) {
      await onRefreshInventory();
      push({ role: "assistant", content: "Inventory refreshed." });
      return true;
    }
    return false;
  };

  const send = async (overrideMessage?: string) => {
    if (busy) return;
    const prompt = (overrideMessage ?? input).trim();
    if (!prompt && !file) return;

    setBusy(true);
    const userText = prompt || (file ? `Uploaded file: ${file.name}` : "");
    push({ role: "user", content: userText });

    let uploadedFile: { kind: "inventory_file" | "rfq_text"; text?: string; name?: string } | undefined;

    try {
      if (prompt && !file) {
        const handled = await tryRunLocalCommand(prompt);
        if (handled) {
          setBusy(false);
          setInput("");
          return;
        }
      }

      if (file) {
        const name = file.name.toLowerCase();
        const isInventory = name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");

        if (isInventory) {
          if (!canUpload) {
            push({ role: "assistant", content: `Your role (${role}) cannot upload inventory files.` });
            setBusy(false);
            return;
          }
          const uploadMessage = await onUploadInventoryFile(file);
          uploadedFile = { kind: "inventory_file", name: file.name };
          push({ role: "assistant", content: uploadMessage });
        } else if (isTextSpecFile(name)) {
          const text = await file.text();
          uploadedFile = { kind: "rfq_text", text, name: file.name };
          push({ role: "assistant", content: `Loaded specification document: ${file.name}` });
        } else if (isPdfFile(name)) {
          const text = await extractPdfTextFallback(file);
          if (!text.trim()) {
            push({ role: "assistant", content: "Could not extract readable text from this PDF. Please paste the key specification text directly in chat." });
            setBusy(false);
            return;
          }
          uploadedFile = { kind: "rfq_text", text, name: file.name };
          push({ role: "assistant", content: `Loaded PDF specification: ${file.name}` });
        } else {
          push({ role: "assistant", content: "Unsupported file type. Use CSV/XLSX/XLS for inventory, or TXT/MD/EML/RTF/JSON/XML/PDF for industrial specs." });
          setBusy(false);
          return;
        }
      }

      const res = await fetch("/api/chat", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, uploadedFile, context: { ...context, activeView }, llmProvider })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Chat request failed");

      const actions = (json.actions || []) as ChatAction[];
      const gatedActions = actions.filter((a) => {
        if (!canGenerate && (a.type === "parse_quote" || a.type === "save_quote")) return false;
        return true;
      });

      await onApplyActions(gatedActions);
      push({ role: "assistant", content: String(json.reply || "Done.") });
    } catch (err) {
      push({ role: "assistant", content: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setBusy(false);
      setInput("");
      setFile(null);
    }
  };

  return (
    <div className={`panel ${compact ? "flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3" : "space-y-3"}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="section-title">Assistant</div>
          <div className="font-semibold">AI Copilot Chat</div>
        </div>
        <div className="text-xs text-steel-600">Role: {role}</div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-steel-200 bg-steel-50 p-2 text-xs">
        <span className="text-steel-600">LLM Route</span>
        <button
          className={llmProvider === "openai" ? "btn px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"}
          onClick={() => onChangeLlmProvider("openai")}
          title="OpenAI route"
        >
          🌐 OpenAI
        </button>
        <button
          className={llmProvider === "deepseek" ? "btn px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"}
          onClick={() => onChangeLlmProvider("deepseek")}
          title="DeepSeek route"
        >
          🇨🇳 DeepSeek
        </button>
      </div>

      <div className={`${compact ? "min-h-0 flex-1" : "max-h-72"} space-y-2 overflow-auto rounded-xl border border-steel-200 bg-steel-50 p-2`}>
        {!messages.length && (
          <div className="rounded-lg bg-white px-2 py-2 text-sm text-steel-600">
            Ask anything about industrial sourcing: add suppliers, assess supplier history/risk, analyze inventory, parse spec documents, or draft/send supplier emails.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={`${m.role}-${i}`} className={m.role === "assistant" ? "rounded-lg bg-white px-2 py-1 text-sm" : "rounded-lg border border-teal-100 bg-teal-50 px-2 py-1 text-sm font-medium"}>
            <span className="mr-2 text-xs uppercase text-steel-600">{m.role}</span>
            <span>{m.content}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className={`${compact ? "max-h-40 overflow-auto pr-1" : ""}`}>
        <div className="grid grid-cols-2 gap-2">
          {activeView === "workspace" && (
            <>
              <button className="btn-secondary" onClick={() => void send("Validate buyer using current buyer email and customer details")}>Validate Buyer</button>
              <button className="btn-secondary" onClick={() => void send("Check logistics completeness from the current RFQ and tell me what is missing")}>Check Logistics</button>
              <button className="btn-secondary" onClick={() => void send("Suggest pricing margin based on risk and apply suggested margin")}>Suggest Margin</button>
              <button className="btn-secondary" onClick={() => void send("Parse and generate quote from current RFQ")}>Run Parse</button>
            </>
          )}
          {activeView === "inventory" && (
            <>
              <button className="btn-secondary" onClick={() => void send("Analyze inventory risk and summarize low stock and out of stock categories")}>Analyze Inventory</button>
              <button className="btn-secondary" onClick={() => void onRefreshInventory?.()}>Refresh Inventory</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("sourcing")}>Open Sourcing</button>
              <button className="btn-secondary" onClick={() => void send("Suggest pricing margin based on risk and apply suggested margin")}>Suggest Margin</button>
            </>
          )}
          {activeView === "sourcing" && (
            <>
              <button className="btn-secondary" onClick={() => void send("Assess supplier history and risk for preferred suppliers")}>Assess Suppliers</button>
              <button className="btn-secondary" onClick={() => void send("Draft supplier outreach email for low stock sourcing request")}>Draft Supplier Email</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("inventory")}>Back to Inventory</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("buyers")}>Open Buyers</button>
            </>
          )}
          {activeView === "buyers" && (
            <>
              <button className="btn-secondary" onClick={() => void send("Validate buyer using current buyer email and customer details")}>Validate Buyer</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("workspace")}>Start Quote</button>
              <button className="btn-secondary" onClick={() => void send("Draft a short buyer reply to confirm specs and ETA expectations")}>Draft Reply</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("quotes")}>Open Quotes</button>
            </>
          )}
          {(activeView === "dashboard" || activeView === "quotes" || activeView === "settings") && (
            <>
              <button className="btn-secondary" onClick={() => onNavigateView?.("workspace")}>Open Workspace</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("inventory")}>Open Inventory</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("sourcing")}>Open Sourcing</button>
              <button className="btn-secondary" onClick={() => void send("Analyze inventory risk and summarize low stock and out of stock categories")}>Inventory Risk</button>
            </>
          )}
        </div>
      </div>

      <textarea
        className="input min-h-20"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask naturally: add supplier, assess supplier history, email supplier, parse specs, analyze inventory..."
      />

      <input
        type="file"
        className="input"
        accept=".csv,.xlsx,.xls,.txt,.eml,.md,.rtf,.json,.xml,.pdf,.spec"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <button className="btn w-full" disabled={busy || (!input.trim() && !file)} onClick={() => void send()}>
        {busy ? "Working..." : "Send to Copilot"}
      </button>

      {!canGenerate && <p className="text-xs text-amber-700">Your role cannot trigger quote parsing or quote save actions.</p>}
    </div>
  );
}
