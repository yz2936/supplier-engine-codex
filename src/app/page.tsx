"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AIChatPanel } from "@/components/AIChatPanel";
import { BuyerInbox } from "@/components/BuyerInbox";
import { DashboardOverview } from "@/components/DashboardOverview";
import { InventoryCatalogManager } from "@/components/InventoryCatalogManager";
import { InventoryUploader } from "@/components/InventoryUploader";
import { QuoteHistory } from "@/components/QuoteHistory";
import { ResultsTable } from "@/components/ResultsTable";
import { SourcingHub } from "@/components/SourcingHub";
import { canGenerateQuotes, canUploadInventory, roleLabel } from "@/lib/auth";
import { draftQuoteText, money } from "@/lib/format";
import { QuoteLine, UserRole } from "@/lib/types";
import { LlmProvider } from "@/lib/llm-provider";

type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  onboarded: boolean;
  createdAt: string;
};

type View = "dashboard" | "workspace" | "inventory" | "sourcing" | "buyers" | "quotes" | "settings";

const defaultRFQ = "";

export default function HomePage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loadingUser, setLoadingUser] = useState(true);
  const [authError, setAuthError] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState<UserRole>("sales_rep");

  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingCompany, setOnboardingCompany] = useState("");
  const [onboardingRole, setOnboardingRole] = useState<UserRole>("sales_rep");

  const [activeView, setActiveView] = useState<View>("dashboard");
  const [customerName, setCustomerName] = useState("");
  const [rfqText, setRfqText] = useState(defaultRFQ);
  const [marginPercent, setMarginPercent] = useState(12);
  const [autoParse, setAutoParse] = useState(true);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inventoryCount, setInventoryCount] = useState<number>(0);
  const [sourcingSeedSku, setSourcingSeedSku] = useState<string>("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [draftSubject, setDraftSubject] = useState("Quotation");
  const [draftIntro, setDraftIntro] = useState("Thank you for the opportunity. Please find our quotation below.");
  const [draftEta, setDraftEta] = useState("Earliest available");
  const [draftValidDays, setDraftValidDays] = useState(7);
  const [draftIncoterm, setDraftIncoterm] = useState("FOB Origin");
  const [draftPaymentTerms, setDraftPaymentTerms] = useState("Net 30");
  const [draftFreightTerms, setDraftFreightTerms] = useState("Packed for sea freight");
  const [draftNotes, setDraftNotes] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("openai");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const parseAbortRef = useRef<AbortController | null>(null);
  const parseRequestIdRef = useRef(0);

  const role = user?.role ?? "sales_rep";
  const renderNavIcon = (view: View) => {
    if (view === "dashboard") {
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 3h6v6H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 11h6v6H3z" />
        </svg>
      );
    }
    if (view === "workspace") {
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 4h12v12H4z" />
          <path d="M7 8h6M7 12h4" />
        </svg>
      );
    }
    if (view === "inventory") {
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 6l7-3 7 3-7 3-7-3z" />
          <path d="M3 10l7 3 7-3M3 14l7 3 7-3" />
        </svg>
      );
    }
    if (view === "sourcing") {
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 10h5M11 10h5M9 8l2 2-2 2" />
          <circle cx="4" cy="10" r="2" />
          <circle cx="16" cy="10" r="2" />
        </svg>
      );
    }
    if (view === "buyers") {
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="7" cy="7" r="3" />
          <circle cx="14" cy="8" r="2.5" />
          <path d="M2.5 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 16c.2-1.8 1.6-3 3.5-3 1.7 0 3.1 1.2 3.3 3" />
        </svg>
      );
    }
    if (view === "quotes") {
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 3h7l3 3v11H5z" />
          <path d="M12 3v3h3M7 10h6M7 13h4" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="10" cy="10" r="6" />
        <path d="M10 7v3l2 2" />
      </svg>
    );
  };
  const viewMeta: Record<View, { label: string; hint: string }> = {
    dashboard: { label: "Dashboard", hint: "Inbound, inventory, and supplier health at a glance" },
    workspace: { label: "Workspace", hint: "RFQ parsing, pricing, and quote delivery" },
    inventory: { label: "Inventory", hint: "Stock control and row-level updates" },
    sourcing: { label: "Sourcing", hint: "Route shortages to upstream suppliers" },
    buyers: { label: "Buyers", hint: "Inbound buyer messages and RFQ intake" },
    quotes: { label: "Quotes", hint: "Quote history and conversion tracking" },
    settings: { label: "Settings", hint: "Account and workspace preferences" }
  };

  useEffect(() => {
    const locale = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const cnLike = locale.includes("zh-cn") || locale.includes("zh-hans") || tz.includes("Shanghai") || tz.includes("Chongqing");
    setLlmProvider(cnLike ? "deepseek" : "openai");
  }, []);

  useEffect(() => {
    setBuyerName(customerName);
    setDraftSubject(customerName ? `Quotation for ${customerName}` : "Quotation");
    setDraftIntro(customerName
      ? `Thank you for the opportunity. Please find our quotation below for ${customerName}.`
      : "Thank you for the opportunity. Please find our quotation below."
    );
  }, [customerName]);

  const draftMeta = useMemo(() => ({
    buyerName,
    subject: draftSubject,
    intro: draftIntro,
    eta: draftEta,
    validDays: draftValidDays,
    incoterm: draftIncoterm,
    paymentTerms: draftPaymentTerms,
    freightTerms: draftFreightTerms,
    notes: draftNotes,
    senderName: user?.name || "Sales Team",
    senderTitle: roleLabel(role),
    companyName: user?.companyName || "Stainless Logic"
  }), [
    buyerName,
    draftEta,
    draftFreightTerms,
    draftIncoterm,
    draftIntro,
    draftNotes,
    draftPaymentTerms,
    draftSubject,
    draftValidDays,
    role,
    user?.companyName,
    user?.name
  ]);

  const draft = useMemo(() => draftQuoteText(customerName, lines, total, draftMeta), [customerName, lines, total, draftMeta]);

  const loadCurrentUser = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    const json = await res.json();
    setUser(json.user ?? null);
    if (json.user) {
      setOnboardingName(json.user.name);
      setOnboardingCompany(json.user.companyName || "");
      setOnboardingRole(json.user.role);
    }
  }, []);

  const loadInventoryCount = useCallback(async () => {
    const res = await fetch("/api/inventory");
    if (!res.ok) return;
    const json = await res.json();
    setInventoryCount(json.inventory?.length ?? 0);
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingUser(true);
      await loadCurrentUser();
      setLoadingUser(false);
    })();
  }, [loadCurrentUser]);

  useEffect(() => {
    if (user?.onboarded) {
      loadInventoryCount();
    }
  }, [loadInventoryCount, user?.onboarded]);

  const runParse = useCallback(async (rfq: string, margin: number) => {
    const text = rfq.trim();
    if (!text) {
      setLines([]);
      setTotal(0);
      setError("RFQ text is required");
      return null;
    }

    parseRequestIdRef.current += 1;
    const requestId = parseRequestIdRef.current;
    parseAbortRef.current?.abort();
    const controller = new AbortController();
    parseAbortRef.current = controller;

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, marginPercent: margin, llmProvider }),
        signal: controller.signal
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Session expired. Please log in again.");
        }
        throw new Error(json.error || "Parse failed");
      }
      // Ignore stale responses from older parse requests.
      if (requestId !== parseRequestIdRef.current) return null;
      const nextLines = json.quoteLines || [];
      const nextTotal = json.total || 0;
      setLines(nextLines);
      setTotal(nextTotal);
      return { lines: nextLines, total: nextTotal };
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return null;
      setError(err instanceof Error ? err.message : "Parse failed");
      return null;
    } finally {
      if (requestId === parseRequestIdRef.current) {
        setBusy(false);
      }
    }
  }, [llmProvider]);

  const parseAndPrice = useCallback(async () => {
    await runParse(rfqText, marginPercent);
  }, [marginPercent, rfqText, runParse]);

  const saveQuote = useCallback(async (override?: { lines: QuoteLine[]; total: number }) => {
    const finalLines = override?.lines ?? lines;
    const finalTotal = override?.total ?? total;
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName, itemsQuoted: finalLines, totalPrice: finalTotal, status: "Draft" })
    });
    if (res.ok) return { ok: true as const, message: "Quote saved as Draft" };
    const json = await res.json();
    return { ok: false as const, message: json.error || "Failed to save quote" };
  }, [customerName, lines, total]);

  const uploadInventoryFile = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/inventory/upload", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Upload failed");
    await loadInventoryCount();
    return `Uploaded ${json.count} inventory rows from ${file.name}.`;
  }, [loadInventoryCount]);

  const refreshInventoryWorkspace = useCallback(async () => {
    await loadInventoryCount();
    window.dispatchEvent(new CustomEvent("inventory:refresh"));
  }, [loadInventoryCount]);

  const applyChatActions = useCallback(async (
    actions: Array<
      | { type: "set_margin"; value: number }
      | { type: "set_customer"; value: string }
      | { type: "set_buyer_email"; value: string }
      | { type: "set_rfq"; value: string; mode: "replace" | "append" }
      | { type: "parse_quote" }
      | { type: "save_quote" }
    >
  ) => {
    let nextRfq = rfqText;
    let nextMargin = marginPercent;
    let parsedResult: { lines: QuoteLine[]; total: number } | null = null;

    for (const action of actions) {
      if (action.type === "set_margin") {
        nextMargin = Math.min(40, Math.max(0, action.value));
        setMarginPercent(nextMargin);
      }
      if (action.type === "set_customer") setCustomerName(action.value);
      if (action.type === "set_buyer_email") setBuyerEmail(action.value);
      if (action.type === "set_rfq") {
        nextRfq = action.mode === "append" ? `${nextRfq}\n${action.value}`.trim() : action.value.trim();
        setRfqText(nextRfq);
      }
    }

    for (const action of actions) {
      if (action.type === "parse_quote") parsedResult = await runParse(nextRfq, nextMargin);
      if (action.type === "save_quote" && (parsedResult?.lines.length || lines.length)) await saveQuote(parsedResult ?? undefined);
    }
  }, [lines.length, marginPercent, rfqText, runParse, saveQuote]);

  const startQuoteFromBuyerMessage = useCallback(async (
    payload: { buyerName: string; buyerEmail: string; rfqText: string }
  ) => {
    const buyer = payload.buyerName?.trim() || "Buyer";
    const rfq = payload.rfqText?.trim();
    if (!rfq) throw new Error("Inbound message is empty");

    setActiveView("workspace");
    setCustomerName(buyer);
    setBuyerName(buyer);
    setBuyerEmail(payload.buyerEmail?.trim() || "");
    setRfqText(rfq);
    setSendStatus("");
    await runParse(rfq, marginPercent);
  }, [marginPercent, runParse]);

  useEffect(() => {
    if (!autoParse || !canGenerateQuotes(role)) return;
    const text = rfqText.trim();
    if (!text) {
      setLines([]);
      setTotal(0);
      setError("");
      return;
    }

    const t = setTimeout(() => {
      runParse(text, marginPercent);
    }, 700);
    return () => clearTimeout(t);
  }, [autoParse, marginPercent, rfqText, role, runParse]);

  useEffect(() => () => {
    parseAbortRef.current?.abort();
  }, []);

  if (loadingUser) {
    return <main className="mx-auto min-h-screen max-w-7xl p-6"><div className="panel">Loading workspace...</div></main>;
  }

  if (!user) {
    return (
      <main className="mx-auto min-h-screen max-w-md p-6">
        <div className="panel space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-steel-800">Stainless Logic</h1>
            <p className="text-sm text-steel-700">Sign in to access your quoting workspace.</p>
          </div>

          <div className="flex gap-2">
            <button className={authMode === "login" ? "btn" : "btn-secondary"} onClick={() => setAuthMode("login")}>Login</button>
            <button className={authMode === "register" ? "btn" : "btn-secondary"} onClick={() => setAuthMode("register")}>Create Account</button>
          </div>

          {authMode === "login" ? (
            <div className="space-y-2">
              <input className="input" placeholder="Work email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              <input className="input" placeholder="Password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
              <button
                className="btn w-full"
                onClick={async () => {
                  setAuthError("");
                  const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: loginEmail, password: loginPassword })
                  });
                  const json = await res.json();
                  if (!res.ok) return setAuthError(json.error || "Login failed");
                  await loadCurrentUser();
                }}
              >
                Login
              </button>
              <p className="text-xs text-steel-600">Demo login: `mia.manager@stainless.local` / `Password123!`</p>
            </div>
          ) : (
            <div className="space-y-2">
              <input className="input" placeholder="Full name" value={regName} onChange={(e) => setRegName(e.target.value)} />
              <input className="input" placeholder="Work email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
              <input className="input" placeholder="Password (min 8 chars)" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
              <select className="input" value={regRole} onChange={(e) => setRegRole(e.target.value as UserRole)}>
                <option value="sales_rep">Sales Representative</option>
                <option value="inventory_manager">Inventory Manager</option>
                <option value="sales_manager">Sales Manager</option>
              </select>
              <button
                className="btn w-full"
                onClick={async () => {
                  setAuthError("");
                  const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: regName, email: regEmail, password: regPassword, role: regRole })
                  });
                  const json = await res.json();
                  if (!res.ok) return setAuthError(json.error || "Registration failed");
                  await loadCurrentUser();
                }}
              >
                Create Account
              </button>
            </div>
          )}

          {authError && <p className="text-sm text-rose-600">{authError}</p>}
        </div>
      </main>
    );
  }

  if (!user.onboarded) {
    return (
      <main className="mx-auto min-h-screen max-w-xl p-6">
        <div className="panel space-y-4">
          <h1 className="text-2xl font-bold">Onboarding</h1>
          <p className="text-sm text-steel-700">Set your profile so the workspace matches your role and permissions.</p>
          <input className="input" value={onboardingName} onChange={(e) => setOnboardingName(e.target.value)} placeholder="Your full name" />
          <input className="input" value={onboardingCompany} onChange={(e) => setOnboardingCompany(e.target.value)} placeholder="Company name" />
          <select className="input" value={onboardingRole} onChange={(e) => setOnboardingRole(e.target.value as UserRole)}>
            <option value="sales_rep">Sales Representative</option>
            <option value="inventory_manager">Inventory Manager</option>
            <option value="sales_manager">Sales Manager</option>
          </select>
          <button
            className="btn"
            onClick={async () => {
              const res = await fetch("/api/auth/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: onboardingName, companyName: onboardingCompany, role: onboardingRole })
              });
              if (res.ok) await loadCurrentUser();
            }}
          >
            Continue to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1700px] p-4 md:p-6">
      <div className={`grid grid-cols-1 gap-4 lg:grid-cols-[230px_minmax(0,1fr)] ${chatOpen ? "xl:grid-cols-[230px_minmax(0,1fr)_400px]" : ""}`}>
        <aside className="panel h-fit space-y-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-steel-900">Stainless Logic</h1>
              <p className="text-xs text-steel-600">{user.companyName}</p>
            </div>
            <button className="btn-secondary px-2 py-1 text-xs lg:hidden" onClick={() => setMobileNavOpen((v) => !v)}>
              {mobileNavOpen ? "Close" : "Menu"}
            </button>
          </div>
          <div className="rounded-xl border border-steel-200 bg-steel-50 p-3 text-sm">
            <div className="font-semibold text-steel-900">{user.name}</div>
            <div className="hidden text-steel-700 sm:block">{user.email}</div>
            <div className="mt-2 inline-block rounded-full bg-teal-700 px-2 py-1 text-xs text-white">{roleLabel(user.role)}</div>
          </div>

          <nav className={`space-y-1.5 ${mobileNavOpen ? "block" : "hidden"} lg:block`}>
            <div className="section-title">Navigation</div>
            {([
              "dashboard",
              "workspace",
              "inventory",
              "sourcing",
              ...(role === "sales_manager" ? ["buyers"] : []),
              "quotes",
              "settings"
            ] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setActiveView(v)}
                className={
                  activeView === v
                    ? "flex w-full items-center justify-between rounded-lg border border-teal-700 bg-teal-700 px-2.5 py-2 text-left text-sm font-medium text-white"
                    : "flex w-full items-center justify-between rounded-lg border border-steel-200 bg-white px-2.5 py-2 text-left text-sm text-steel-800 hover:bg-steel-50"
                }
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className={activeView === v ? "text-white" : "text-steel-600"}>
                    {renderNavIcon(v)}
                  </span>
                  <span className="truncate">{viewMeta[v].label}</span>
                </div>
                {activeView === v && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </button>
            ))}
          </nav>

          <button
            className="btn-secondary w-full"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              setUser(null);
              setLines([]);
              setTotal(0);
            }}
          >
            Logout
          </button>
        </aside>

        <section className="min-w-0 space-y-4">
          <header className="panel flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="section-title">Dashboard</div>
              <h2 className="text-2xl font-semibold text-steel-900">{viewMeta[activeView].label}</h2>
              <p className="text-sm text-steel-700">{viewMeta[activeView].hint}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm md:min-w-[240px]">
              <div className="kpi-card">
                <div className="text-xs text-steel-600">Inventory Rows</div>
                <div className="text-lg font-semibold">{inventoryCount}</div>
              </div>
              <div className="kpi-card">
                <div className="text-xs text-steel-600">Access</div>
                <div className="text-lg font-semibold">{roleLabel(role)}</div>
              </div>
            </div>
            <div className="w-full rounded-xl border border-steel-200 bg-steel-50 p-2 text-xs md:max-w-[280px]">
              <div className="mb-1 font-medium text-steel-700">AI Route</div>
              <div className="flex flex-wrap gap-1">
                <button
                  className={llmProvider === "openai" ? "btn px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"}
                  onClick={() => setLlmProvider("openai")}
                  title="Global model route: OpenAI"
                >
                  🌐 OpenAI
                </button>
                <button
                  className={llmProvider === "deepseek" ? "btn px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"}
                  onClick={() => setLlmProvider("deepseek")}
                  title="Global model route: DeepSeek"
                >
                  🇨🇳 DeepSeek
                </button>
              </div>
            </div>
          </header>

          {activeView === "dashboard" && (
            <DashboardOverview />
          )}

          {activeView === "workspace" && (
            <div className="space-y-4">
              <div className="panel">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="step-badge">Step 1: Input RFQ</span>
                  <span className="text-steel-400">→</span>
                  <span className="step-badge">Step 2: Parse + Price</span>
                  <span className="text-steel-400">→</span>
                  <span className="step-badge">Step 3: Draft + Send</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
              <section className="panel space-y-3">
                <div>
                  <div className="section-title">Step 1</div>
                  <div className="font-semibold">RFQ Input Workspace</div>
                </div>
                <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
                <textarea className="input min-h-[260px] font-mono text-xs md:min-h-[320px]" value={rfqText} onChange={(e) => setRfqText(e.target.value)} />
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-steel-200 bg-steel-50 p-2">
                  <button className="btn" onClick={parseAndPrice} disabled={!canGenerateQuotes(role) || busy}>{busy ? "Parsing..." : "Parse + Match + Price"}</button>
                  <button className="btn-secondary" onClick={() => setAutoParse((v) => !v)} disabled={!canGenerateQuotes(role)}>
                    {autoParse ? "Auto-Parse: ON" : "Auto-Parse: OFF"}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setCustomerName("");
                      setRfqText("");
                      setBuyerEmail("");
                      setBuyerName("");
                      setLines([]);
                      setTotal(0);
                      setError("");
                      setSendStatus("");
                    }}
                  >
                    Clear Workspace
                  </button>
                  <button className="btn-secondary" onClick={async () => navigator.clipboard.writeText(draft)} disabled={!lines.length}>Copy Draft</button>
                  <button
                    className="btn-secondary"
                    disabled={!lines.length || !canGenerateQuotes(role)}
                    onClick={async () => {
                      const result = await saveQuote();
                      if (result.ok) alert(result.message);
                    }}
                  >
                    Save Quote
                  </button>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium">Margin Control: {marginPercent}%</div>
                  <input type="range" min={0} max={40} value={marginPercent} className="w-full" onChange={(e) => setMarginPercent(Number(e.target.value))} disabled={!canGenerateQuotes(role)} />
                </div>

                {error && <p className="text-sm text-rose-600">{error}</p>}
                <div className="space-y-2 rounded-xl border border-steel-200 bg-steel-50 p-3">
                  <div>
                    <div className="section-title">Step 3</div>
                    <div className="font-medium text-sm">Quote Draft + Email Setup</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input className="input" placeholder="Buyer name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
                    <input className="input" placeholder="Buyer email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
                    <input className="input md:col-span-2" placeholder="Email subject" value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
                    <textarea className="input md:col-span-2 min-h-20" placeholder="Email intro" value={draftIntro} onChange={(e) => setDraftIntro(e.target.value)} />
                    <input className="input" placeholder="ETA" value={draftEta} onChange={(e) => setDraftEta(e.target.value)} />
                    <input className="input" type="number" min={1} value={draftValidDays} onChange={(e) => setDraftValidDays(Number(e.target.value || 7))} />
                    <input className="input" placeholder="Incoterm" value={draftIncoterm} onChange={(e) => setDraftIncoterm(e.target.value)} />
                    <input className="input" placeholder="Payment terms" value={draftPaymentTerms} onChange={(e) => setDraftPaymentTerms(e.target.value)} />
                    <input className="input md:col-span-2" placeholder="Freight terms" value={draftFreightTerms} onChange={(e) => setDraftFreightTerms(e.target.value)} />
                    <textarea className="input md:col-span-2 min-h-16" placeholder="Additional notes" value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" disabled={!lines.length} onClick={async () => navigator.clipboard.writeText(draft)}>Copy Updated Draft</button>
                    <button
                      className="btn"
                      disabled={!lines.length || !buyerEmail || !canGenerateQuotes(role)}
                      onClick={async () => {
                        setSendStatus("Sending...");
                        try {
                          const res = await fetch("/api/quote-email", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              buyerEmail,
                              customerName,
                              lines,
                              total,
                              meta: draftMeta
                            })
                          });

                          const raw = await res.text();
                          let payload: { message?: string; error?: string } = {};
                          try {
                            payload = raw ? JSON.parse(raw) : {};
                          } catch {
                            payload = { error: raw || "Unexpected server response" };
                          }

                          setSendStatus(res.ok ? payload.message || "Sent" : payload.error || "Failed to send");
                        } catch (err) {
                          setSendStatus(err instanceof Error ? err.message : "Failed to send");
                        }
                      }}
                    >
                      Send Quote Email
                    </button>
                  </div>
                  {sendStatus && <p className="text-xs text-steel-700">{sendStatus}</p>}
                </div>
                <div className="rounded-xl border border-steel-200 bg-steel-50 p-3">
                  <div className="mb-2 section-title">Draft Preview</div>
                  <div className="text-xs whitespace-pre-wrap">{draft}</div>
                </div>
              </section>

              <section className="space-y-4">
                <ResultsTable lines={lines} />
                <div className="panel flex items-center justify-between">
                  <div>
                    <div className="section-title">Step 2</div>
                    <div className="text-lg font-semibold">Quote Total</div>
                  </div>
                  <div className="text-2xl font-bold text-teal-800">{money(total)}</div>
                </div>
              </section>
            </div>
            </div>
          )}

          {activeView === "inventory" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                {canUploadInventory(role)
                  ? <InventoryUploader onUploaded={loadInventoryCount} />
                  : <div className="panel text-sm text-steel-700">Only Inventory Managers and Sales Managers can upload inventory snapshots.</div>}
              </div>
              <InventoryCatalogManager
                editable={canUploadInventory(role)}
                onSourceLine={(sku) => {
                  setSourcingSeedSku(sku);
                  setActiveView("sourcing");
                }}
              />
            </div>
          )}

          {activeView === "sourcing" && (
            <SourcingHub
              customerName={customerName}
              quoteLines={lines}
              initialInventorySku={sourcingSeedSku}
              onSeedConsumed={() => setSourcingSeedSku("")}
            />
          )}

          {activeView === "quotes" && (
            canGenerateQuotes(role)
              ? <QuoteHistory enabled />
              : <div className="panel text-sm text-steel-700">Your role cannot access quote generation/history.</div>
          )}

          {activeView === "buyers" && (
            role === "sales_manager"
              ? <BuyerInbox onStartQuote={startQuoteFromBuyerMessage} />
              : <div className="panel text-sm text-steel-700">Only Sales Managers can access buyer routing inbox.</div>
          )}

          {activeView === "settings" && (
            <div className="panel space-y-2 text-sm">
              <div><span className="font-medium">Name:</span> {user.name}</div>
              <div><span className="font-medium">Email:</span> {user.email}</div>
              <div><span className="font-medium">Company:</span> {user.companyName}</div>
              <div><span className="font-medium">Role:</span> {roleLabel(user.role)}</div>
              <div className="text-steel-600">Role determines allowed actions for pricing, inventory updates, and quote visibility.</div>
            </div>
          )}
        </section>

        {chatOpen && (
          <aside className="hidden xl:block xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
          <AIChatPanel
            activeView={activeView}
            compact
            role={role}
            canGenerate={canGenerateQuotes(role)}
            canUpload={canUploadInventory(role)}
            llmProvider={llmProvider}
            onChangeLlmProvider={setLlmProvider}
            context={{
              customerName,
              buyerEmail,
                rfqText,
                marginPercent,
                lineCount: lines.length,
                stockSummary: {
                  green: lines.filter((l) => l.stockStatus === "green").length,
                  yellow: lines.filter((l) => l.stockStatus === "yellow").length,
                  red: lines.filter((l) => l.stockStatus === "red").length
                }
              }}
              onApplyActions={applyChatActions}
            onUploadInventoryFile={uploadInventoryFile}
            onNavigateView={setActiveView}
            onRefreshInventory={refreshInventoryWorkspace}
          />
          </aside>
        )}
      </div>
      <button
        className="fixed bottom-4 right-4 z-40 rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-teal-800"
        onClick={() => setChatOpen((v) => !v)}
      >
        {chatOpen ? "Hide Copilot" : "Show Copilot"}
      </button>
      {chatOpen && (
        <div className="fixed inset-0 z-30 xl:hidden">
          <div className="absolute inset-0 bg-steel-900/30" onClick={() => setChatOpen(false)} />
          <aside className="absolute bottom-16 right-2 top-2 w-[min(420px,calc(100vw-1rem))]">
            <AIChatPanel
              activeView={activeView}
              compact
              role={role}
              canGenerate={canGenerateQuotes(role)}
              canUpload={canUploadInventory(role)}
              llmProvider={llmProvider}
              onChangeLlmProvider={setLlmProvider}
              context={{
                customerName,
                buyerEmail,
                rfqText,
                marginPercent,
                lineCount: lines.length,
                stockSummary: {
                  green: lines.filter((l) => l.stockStatus === "green").length,
                  yellow: lines.filter((l) => l.stockStatus === "yellow").length,
                  red: lines.filter((l) => l.stockStatus === "red").length
                }
              }}
              onApplyActions={applyChatActions}
              onUploadInventoryFile={uploadInventoryFile}
              onNavigateView={setActiveView}
              onRefreshInventory={refreshInventoryWorkspace}
            />
          </aside>
        </div>
      )}
    </main>
  );
}
