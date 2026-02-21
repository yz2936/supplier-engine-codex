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
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Ask me in natural language. Example: 'Set margin to 18% and parse this RFQ.' You can also attach CSV/XLSX/XLS inventory files or TXT/EML/MD RFQ files."
    }
  ]);
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
        const isText = name.endsWith(".txt") || name.endsWith(".eml") || name.endsWith(".md");

        if (isInventory) {
          if (!canUpload) {
            push({ role: "assistant", content: `Your role (${role}) cannot upload inventory files.` });
            setBusy(false);
            return;
          }
          const uploadMessage = await onUploadInventoryFile(file);
          uploadedFile = { kind: "inventory_file", name: file.name };
          push({ role: "assistant", content: uploadMessage });
        } else if (isText) {
          const text = await file.text();
          uploadedFile = { kind: "rfq_text", text, name: file.name };
        } else {
          push({ role: "assistant", content: "Unsupported file type. Use CSV/XLSX/XLS for inventory or TXT/EML/MD for RFQ text." });
          setBusy(false);
          return;
        }
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, uploadedFile, context: { ...context, activeView } })
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
              <button className="btn-secondary" onClick={() => void onRefreshInventory?.()}>Refresh Inventory</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("sourcing")}>Open Sourcing</button>
              <button className="btn-secondary" onClick={() => void send("Suggest pricing margin based on risk and apply suggested margin")}>Suggest Margin</button>
              <button className="btn-secondary" onClick={() => void send("Check logistics completeness from the current RFQ and tell me what is missing")}>Logistics Check</button>
            </>
          )}
          {activeView === "sourcing" && (
            <>
              <button className="btn-secondary" onClick={() => void send("Suggest margin impact for low stock and upstream sourcing risk")}>Risk Margin</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("inventory")}>Back to Inventory</button>
              <button className="btn-secondary" onClick={() => onNavigateView?.("buyers")}>Open Buyers</button>
              <button className="btn-secondary" onClick={() => void send("Summarize next sourcing actions and buyer communication plan")}>Next Steps</button>
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
              <button className="btn-secondary" onClick={() => void send("Suggest pricing margin based on risk and apply suggested margin")}>Suggest Margin</button>
            </>
          )}
        </div>
      </div>

      <textarea
        className="input min-h-20"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask naturally: set margin, parse RFQ, save quote, upload inventory..."
      />

      <input
        type="file"
        className="input"
        accept=".csv,.xlsx,.xls,.txt,.eml,.md"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <button className="btn w-full" disabled={busy || (!input.trim() && !file)} onClick={() => void send()}>
        {busy ? "Working..." : "Send to Copilot"}
      </button>

      {!canGenerate && <p className="text-xs text-amber-700">Your role cannot trigger quote parsing or quote save actions.</p>}
    </div>
  );
}
