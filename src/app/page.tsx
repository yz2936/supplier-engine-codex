"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AIChatPanel } from "@/components/AIChatPanel";
import { BuyerInbox } from "@/components/BuyerInbox";
import { DashboardOverview } from "@/components/DashboardOverview";
import { EmailIntegrationSettings } from "@/components/EmailIntegrationSettings";
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
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");

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
  const [sourcingSeed, setSourcingSeed] = useState<{
    sku: string;
    category: string;
    grade: string;
    thickness: number;
    width: number;
    length: number;
    schedule?: string;
    qtyOnHand: number;
  } | null>(null);
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
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
    if (typeof window !== "undefined" && window.innerWidth >= 1280) {
      setChatOpen(true);
    }
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
    const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
    const json = await res.json();
    setUser(json.user ?? null);
    if (json.user) {
      setOnboardingName(json.user.name);
      setOnboardingCompany(json.user.companyName || "");
      setOnboardingRole(json.user.role);
    }
  }, []);

  const loadInventoryCount = useCallback(async () => {
    const res = await fetch("/api/inventory", { credentials: "include", cache: "no-store" });
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
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, marginPercent: margin, llmProvider }),
        signal: controller.signal
      });
      const raw = await res.text();
      let json: { error?: string; quoteLines?: QuoteLine[]; total?: number } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = { error: raw || "Unexpected server response" };
      }
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Session expired. Please log in again.");
        }
        throw new Error(json.error || "Parse failed");
      }
      // Ignore stale responses from older parse requests.
      if (requestId !== parseRequestIdRef.current) return null;
      const nextLines = json.quoteLines || [];
      const nextTotal = typeof json.total === "number" ? json.total : 0;
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
      credentials: "include",
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
    const res = await fetch("/api/inventory/upload", { credentials: "include", method: "POST", body: form });
    const raw = await res.text();
    let json: { error?: string; count?: number } = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = { error: raw || "Unexpected server response" };
    }
    if (!res.ok) throw new Error(json.error || "Upload failed");
    await loadInventoryCount();
    const count = typeof json.count === "number" ? json.count : 0;
    return `Uploaded ${count} inventory rows from ${file.name}.`;
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
    return <main className="mx-auto min-h-screen max-w-7xl p-6"><div className="border border-steel-200/80 bg-white/85 p-4">Loading workspace...</div></main>;
  }

  if (!user) {
    return (
      <main className="mx-auto min-h-screen max-w-md p-6">
        <div className="space-y-4 border border-steel-200/80 bg-white/85 p-4">
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
                    credentials: "include",
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
                    credentials: "include",
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
        <div className="space-y-4 border border-steel-200/80 bg-white/85 p-4">
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
            disabled={onboardingBusy}
            onClick={async () => {
              setOnboardingError("");
              setOnboardingBusy(true);
              try {
                const res = await fetch("/api/auth/onboarding", {
                  credentials: "include",
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: onboardingName, companyName: onboardingCompany, role: onboardingRole })
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setOnboardingError(json?.error || "Failed to save onboarding profile");
                  return;
                }
                setUser(json.user ?? null);
                await loadCurrentUser();
              } finally {
                setOnboardingBusy(false);
              }
            }}
          >
            {onboardingBusy ? "Saving..." : "Continue to Dashboard"}
          </button>
          {onboardingError && <p className="text-sm text-rose-600">{onboardingError}</p>}
        </div>
      </main>
    );
  }

  const layoutClass = chatOpen
    ? (sidebarCollapsed
      ? "grid grid-cols-1 gap-4 lg:grid-cols-[92px_minmax(0,1fr)] xl:grid-cols-[92px_minmax(0,1fr)_390px]"
      : "grid grid-cols-1 gap-4 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)_390px]")
    : (sidebarCollapsed
      ? "grid grid-cols-1 gap-4 lg:grid-cols-[92px_minmax(0,1fr)]"
      : "grid grid-cols-1 gap-4 lg:grid-cols-[270px_minmax(0,1fr)]");

  return (
    <main className="app-shell mx-auto min-h-screen max-w-[1780px] p-4 md:p-5">
      <div className={layoutClass}>
        <aside className="h-fit space-y-3 border border-steel-200/80 bg-white/85 p-3 lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-2rem)] lg:flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-lg text-white shadow-[0_10px_24px_rgba(242,104,9,0.35)]">⌘</div>
              <div className={`space-y-0.5 ${sidebarCollapsed ? "hidden lg:hidden" : ""}`}>
                <h1 className="font-['Sora'] text-xl font-semibold text-steel-900">Stainless Logic</h1>
                <p className="text-[11px] uppercase tracking-[0.18em] text-steel-500">Procurement OS</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="btn-secondary px-2 py-1 text-xs lg:hidden" onClick={() => setMobileNavOpen((v) => !v)}>
                {mobileNavOpen ? "Close" : "Menu"}
              </button>
              <button
                className="btn-secondary hidden h-8 w-8 items-center justify-center px-0 py-0 lg:inline-flex"
                onClick={() => setSidebarCollapsed((v) => !v)}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <svg viewBox="0 0 20 20" className={`h-4 w-4 transition ${sidebarCollapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12.5 4.5 7 10l5.5 5.5" />
                </svg>
              </button>
            </div>
          </div>
          {!sidebarCollapsed && (
            <div className="border border-steel-200/80 bg-white/82 p-2.5 text-sm">
              <div className="font-semibold text-steel-900">{user.name}</div>
              <div className="hidden text-steel-700 sm:block">{user.email}</div>
              <div className="mt-2 inline-flex rounded-full bg-[#0b1a48] px-2.5 py-1 text-[11px] text-white">{roleLabel(user.role)}</div>
              <div className="mt-2 text-xs text-steel-500">{user.companyName}</div>
            </div>
          )}

          <nav className={`space-y-1.5 ${mobileNavOpen ? "block" : "hidden"} lg:block`}>
            {!sidebarCollapsed && <div className="section-title">Navigation</div>}
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
                    ? `flex w-full items-center ${sidebarCollapsed ? "justify-center" : "justify-between"} rounded-xl border border-[#0b1a48] bg-[#0b1a48] px-3 py-2.5 text-left text-sm font-medium text-white shadow-[0_8px_18px_rgba(8,16,42,0.35)]`
                    : `flex w-full items-center ${sidebarCollapsed ? "justify-center" : "justify-between"} rounded-xl border border-steel-200 bg-white/88 px-3 py-2.5 text-left text-sm text-steel-800 transition hover:border-orange-300 hover:bg-white`
                }
                title={sidebarCollapsed ? viewMeta[v].label : undefined}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className={activeView === v ? "text-white" : "text-steel-600"}>
                    {renderNavIcon(v)}
                  </span>
                  {!sidebarCollapsed && <span className="truncate">{viewMeta[v].label}</span>}
                </div>
                {activeView === v && !sidebarCollapsed && <span className="h-2 w-2 rounded-full bg-orange-400" />}
              </button>
            ))}
          </nav>

          <button
            className="btn-secondary w-full lg:mt-auto"
            onClick={async () => {
              await fetch("/api/auth/logout", { credentials: "include", method: "POST" });
              setUser(null);
              setLines([]);
              setTotal(0);
            }}
            title={sidebarCollapsed ? "Logout" : undefined}
          >
            {sidebarCollapsed ? "⎋" : "Logout"}
          </button>
        </aside>

        <section className="min-w-0 space-y-4">
          <header className="border border-steel-200/80 bg-white/80 p-4 md:p-5">
            <div className="grid gap-4 md:grid-cols-[1.3fr_1fr] md:items-start">
            <div className="space-y-1">
              <div className="section-title">Overview</div>
              <h2 className="font-['Sora'] text-2xl font-semibold text-steel-900">{viewMeta[activeView].label}</h2>
              <p className="text-xs text-steel-600">{viewMeta[activeView].hint}</p>
            </div>
            <div className="w-full space-y-2 md:min-w-[420px]">
              <div className="grid grid-cols-2 gap-3 border-b border-steel-200 pb-2 text-xs">
                <div>
                  <div className="text-[11px] text-steel-600">Inventory Rows</div>
                  <div className="text-lg font-semibold">{inventoryCount}</div>
                </div>
                <div>
                  <div className="text-[11px] text-steel-600">Access</div>
                  <div className="text-lg font-semibold">{roleLabel(role)}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  className={llmProvider === "openai" ? "btn px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"}
                  onClick={() => setLlmProvider("openai")}
                  title="Global model route: OpenAI"
                >
                  OpenAI
                </button>
                <button
                  className={llmProvider === "deepseek" ? "btn px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"}
                  onClick={() => setLlmProvider("deepseek")}
                  title="Global model route: DeepSeek"
                >
                  DeepSeek
                </button>
                <button
                  className="btn-secondary ml-auto px-2.5 py-1 text-xs"
                  onClick={() => {
                    setActiveView("workspace");
                    setRfqText("");
                    setLines([]);
                    setTotal(0);
                    setError("");
                  }}
                >
                  + New RFQ
                </button>
              </div>
            </div>
            </div>
          </header>

          {activeView === "dashboard" && (
            <DashboardOverview />
          )}

          {activeView === "workspace" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
              <section className="space-y-3 border border-steel-200/80 bg-white/85 p-4">
                <div>
                  <div className="section-title">Step 1</div>
                  <div className="font-semibold">RFQ Input Workspace</div>
                </div>
                <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
                <textarea className="input min-h-[260px] font-mono text-xs md:min-h-[320px]" value={rfqText} onChange={(e) => setRfqText(e.target.value)} />
                <div className="flex flex-wrap items-center gap-2 border-y border-steel-200 py-2">
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
                <div className="space-y-2 border-t border-steel-200 pt-3">
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
                            credentials: "include",
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
                <div className="border-t border-steel-200 pt-3">
                  <div className="mb-2 section-title">Draft Preview</div>
                  <div className="text-xs whitespace-pre-wrap">{draft}</div>
                </div>
              </section>

              <section className="space-y-4">
                <ResultsTable lines={lines} />
                <div className="flex items-center justify-between border border-steel-200/80 bg-white/85 p-4">
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
                  : <div className="border border-steel-200/80 bg-white/85 p-4 text-sm text-steel-700">Only Inventory Managers and Sales Managers can upload inventory snapshots.</div>}
              </div>
              <InventoryCatalogManager
                editable={canUploadInventory(role)}
                onSourceLine={(seed) => {
                  setSourcingSeed(seed);
                  setActiveView("sourcing");
                }}
              />
            </div>
          )}

          {activeView === "sourcing" && (
            <SourcingHub
              customerName={customerName}
              quoteLines={lines}
              initialInventorySeed={sourcingSeed ?? undefined}
              onSeedConsumed={() => setSourcingSeed(null)}
            />
          )}

          {activeView === "quotes" && (
            canGenerateQuotes(role)
              ? <QuoteHistory enabled />
              : <div className="border border-steel-200/80 bg-white/85 p-4 text-sm text-steel-700">Your role cannot access quote generation/history.</div>
          )}

          {activeView === "buyers" && (
            role === "sales_manager"
              ? <BuyerInbox onStartQuote={startQuoteFromBuyerMessage} />
              : <div className="border border-steel-200/80 bg-white/85 p-4 text-sm text-steel-700">Only Sales Managers can access buyer routing inbox.</div>
          )}

          {activeView === "settings" && (
            <div className="space-y-4">
              <div className="space-y-2 border border-steel-200/80 bg-white/85 p-4 text-sm">
                <div><span className="font-medium">Name:</span> {user.name}</div>
                <div><span className="font-medium">Email:</span> {user.email}</div>
                <div><span className="font-medium">Company:</span> {user.companyName}</div>
                <div><span className="font-medium">Role:</span> {roleLabel(user.role)}</div>
                <div className="text-steel-600">Role determines allowed actions for pricing, inventory updates, and quote visibility.</div>
              </div>
              <EmailIntegrationSettings />
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
        className="fixed bottom-4 right-4 z-40 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(242,104,9,0.4)] transition hover:-translate-y-0.5 hover:from-orange-600 hover:to-orange-700"
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
