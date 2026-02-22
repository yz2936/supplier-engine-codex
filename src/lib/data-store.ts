import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { AppData } from "@/lib/types";
import { hashPassword, normalizeEmail } from "@/lib/security";

const resolveDataPath = () => {
  const configured = process.env.DATA_PATH?.trim();
  if (configured) return configured;
  if (process.env.VERCEL) return path.join("/tmp", "app-data.json");
  return path.join(process.cwd(), "data", "app-data.json");
};

const dataPath = resolveDataPath();
const resolveDbUrl = () =>
  process.env.DATABASE_URL?.trim()
  || process.env.POSTGRES_URL?.trim()
  || process.env.POSTGRES_PRISMA_URL?.trim()
  || process.env.SUPABASE_DATABASE_URL?.trim()
  || "";

const dbUrl = resolveDbUrl();
const appStateKey = process.env.APP_STATE_KEY?.trim() || "main";

let pool: Pool | null = null;
let dbReady = false;
let fileMutex: Promise<void> = Promise.resolve();

const isTrue = (value: string | undefined, fallback: boolean) => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const isCertChainError = (error: unknown) => {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return message.includes("self-signed certificate") || message.includes("certificate chain");
};

const mapDbError = (error: unknown) => {
  if (!isCertChainError(error)) return error;
  return new Error(
    "Database TLS validation failed (self-signed certificate). Set DATABASE_SSL_ALLOW_SELF_SIGNED=true and DATABASE_SSL_REJECT_UNAUTHORIZED=false in your environment variables."
  );
};

const resolveDbSsl = (): boolean | { rejectUnauthorized: boolean } | undefined => {
  const sslRaw = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (sslRaw === "false") return false;

  const allowSelfSigned = isTrue(process.env.DATABASE_SSL_ALLOW_SELF_SIGNED, false);
  const hasRejectUnauthorizedOverride = typeof process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "string";
  const sslExplicitlyEnabled = sslRaw === "true";

  if (!sslExplicitlyEnabled && !allowSelfSigned && !hasRejectUnauthorizedOverride) {
    // Preserve pg default behavior when SSL is not explicitly configured.
    return undefined;
  }

  const rejectUnauthorized = allowSelfSigned
    ? false
    : isTrue(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, true);
  return { rejectUnauthorized };
};

const defaultManufacturers: AppData["manufacturers"] = [
  {
    id: "m1",
    name: "Atlas Steel Works",
    email: "sales@atlassteel.example",
    phone: "+1-713-555-0182",
    specialties: ["Pipe", "Tube", "Fittings"],
    regions: ["US", "SEA"],
    leadTimeDays: 18,
    preferred: true
  },
  {
    id: "m2",
    name: "Northshore Metals",
    email: "rfq@northshoremetals.example",
    phone: "+1-312-555-0133",
    specialties: ["Sheet", "Plate", "Coil"],
    regions: ["US"],
    leadTimeDays: 14,
    preferred: true
  },
  {
    id: "m3",
    name: "Pacific Alloy Fabricators",
    email: "quotes@pacificalloy.example",
    specialties: ["Bar", "Angle", "Channel", "Specialty Alloys"],
    regions: ["US", "APAC"],
    leadTimeDays: 24,
    preferred: false
  }
];

const defaultData: AppData = {
  inventory: [],
  surcharges: [],
  quotes: [],
  manufacturers: defaultManufacturers,
  sourcingRequests: [],
  users: [
    {
      id: "u1",
      name: "Sam Rep",
      email: "sam.rep@stainless.local",
      passwordHash: hashPassword("Password123!"),
      role: "sales_rep",
      companyId: "c1",
      companyName: "Stainless Logic Demo",
      onboarded: true,
      createdAt: new Date().toISOString()
    },
    {
      id: "u2",
      name: "Ivy Inventory",
      email: "ivy.inventory@stainless.local",
      passwordHash: hashPassword("Password123!"),
      role: "inventory_manager",
      companyId: "c1",
      companyName: "Stainless Logic Demo",
      onboarded: true,
      createdAt: new Date().toISOString()
    },
    {
      id: "u3",
      name: "Mia Manager",
      email: "mia.manager@stainless.local",
      passwordHash: hashPassword("Password123!"),
      role: "sales_manager",
      companyId: "c1",
      companyName: "Stainless Logic Demo",
      onboarded: true,
      createdAt: new Date().toISOString()
    }
  ],
  sessions: [],
  buyers: [],
  buyerMessages: []
};

const normalizeData = (raw: AppData): AppData => {
  const users = (raw.users ?? []).map((user, i) => {
    const baseName = user.name ?? `User ${i + 1}`;
    const email = normalizeEmail((user as { email?: string }).email ?? `${baseName.replace(/\s+/g, ".")}@stainless.local`);
    return {
      id: user.id,
      name: baseName,
      email,
      passwordHash: (user as { passwordHash?: string }).passwordHash ?? hashPassword("Password123!"),
      role: user.role,
      companyId: user.companyId,
      companyName: (user as { companyName?: string }).companyName ?? "Stainless Logic Demo",
      onboarded: (user as { onboarded?: boolean }).onboarded ?? true,
      createdAt: (user as { createdAt?: string }).createdAt ?? new Date().toISOString()
    };
  });

  return {
    inventory: raw.inventory ?? [],
    surcharges: raw.surcharges ?? [],
    quotes: (raw.quotes ?? []).map((q) => ({
      ...q,
      createdByUserId: (q as { createdByUserId?: string }).createdByUserId ?? users[0]?.id ?? "u1"
    })),
    manufacturers: raw.manufacturers?.length ? raw.manufacturers : defaultManufacturers,
    sourcingRequests: (raw.sourcingRequests ?? []).map((r) => ({
      ...r,
      createdByUserId: (r as { createdByUserId?: string }).createdByUserId ?? users[0]?.id ?? "u1",
      status: (r as { status?: "Open" | "Quoted" | "Closed" }).status ?? "Open",
      sourceContext: (r as { sourceContext?: "quote_shortage" | "inventory_restock" }).sourceContext ?? "quote_shortage",
      reason: (r as { reason?: "low_stock" | "out_of_stock" | "new_demand" }).reason ?? "new_demand",
      createdAt: (r as { createdAt?: string }).createdAt ?? new Date().toISOString(),
      updatedAt: (r as { updatedAt?: string }).updatedAt ?? new Date().toISOString()
    })),
    users,
    sessions: (raw.sessions ?? []).filter((s) => s?.token && s?.userId && s?.expiresAt),
    buyers: raw.buyers ?? [],
    buyerMessages: raw.buyerMessages ?? []
  };
};

const usingDatabase = () => Boolean(dbUrl);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableDbError = (err: unknown) => {
  const msg = String((err as { message?: string })?.message || "").toLowerCase();
  const code = String((err as { code?: string })?.code || "");
  const retryCodes = new Set(["57P01", "57P02", "57P03", "53300", "53400", "08000", "08001", "08004", "08006", "40001"]);
  return retryCodes.has(code.toUpperCase())
    || msg.includes("timeout")
    || msg.includes("timed out")
    || msg.includes("econnreset")
    || msg.includes("connection terminated")
    || msg.includes("server closed");
};

const withDbReadRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < 2; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableDbError(error) || i === 1) throw error;
      await sleep(120 * (i + 1));
    }
  }
  throw lastError;
};

const getPool = () => {
  if (!dbUrl) throw new Error("No database URL found (DATABASE_URL/POSTGRES_URL/POSTGRES_PRISMA_URL/SUPABASE_DATABASE_URL)");
  if (!pool) {
    const ssl = resolveDbSsl();
    pool = new Pool({
      connectionString: dbUrl,
      ssl,
      max: Number(process.env.DB_POOL_MAX || 5),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
      query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 10000),
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 10000),
      keepAlive: true
    });
  }
  return pool;
};

const ensureDb = async () => {
  if (dbReady) return;
  const p = getPool();
  await p.query(`
    create table if not exists app_state (
      id text primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    );
  `);
  dbReady = true;
};

const ensureDbSeed = async () => {
  const p = getPool();
  const seed = normalizeData(defaultData);
  await p.query(
    "insert into app_state (id, payload, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do nothing",
    [appStateKey, JSON.stringify(seed)]
  );
};

const readFromDb = async (): Promise<AppData> => {
  await ensureDb();
  await ensureDbSeed();
  const p = getPool();
  const res = await p.query("select payload from app_state where id = $1 limit 1", [appStateKey]);
  if (!res.rowCount) return normalizeData(defaultData);
  return normalizeData(res.rows[0].payload as AppData);
};

const writeToDb = async (data: AppData) => {
  await ensureDb();
  const p = getPool();
  const normalized = normalizeData(data);
  await p.query(
    "insert into app_state (id, payload, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do update set payload = excluded.payload, updated_at = now()",
    [appStateKey, JSON.stringify(normalized)]
  );
};

const readFromFile = async (): Promise<AppData> => {
  try {
    const raw = await fs.readFile(dataPath, "utf8");
    return normalizeData(JSON.parse(raw) as AppData);
  } catch {
    const seed = normalizeData(defaultData);
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(seed, null, 2));
    return seed;
  }
};

const writeToFile = async (data: AppData) => {
  const normalized = normalizeData(data);
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify(normalized, null, 2));
};

const withFileLock = async <T>(fn: () => Promise<T>) => {
  const prev = fileMutex;
  let release!: () => void;
  fileMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
};

export const readData = async (): Promise<AppData> => {
  if (usingDatabase()) {
    try {
      return await withDbReadRetry(readFromDb);
    } catch (error) {
      throw mapDbError(error);
    }
  }
  return readFromFile();
};

export const writeData = async (data: AppData) => {
  if (usingDatabase()) {
    try {
      await writeToDb(data);
    } catch (error) {
      throw mapDbError(error);
    }
    return;
  }
  await writeToFile(data);
};

export const mutateData = async <T>(mutator: (data: AppData) => Promise<T> | T): Promise<T> => {
  if (usingDatabase()) {
    try {
      await ensureDb();
      const p = getPool();
      const client = await p.connect();
      try {
        await client.query("BEGIN");
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [appStateKey]);
        await client.query(
          "insert into app_state (id, payload, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do nothing",
          [appStateKey, JSON.stringify(normalizeData(defaultData))]
        );
        const current = await client.query("select payload from app_state where id = $1 for update", [appStateKey]);
        const data = normalizeData((current.rows[0]?.payload as AppData) ?? defaultData);
        const result = await mutator(data);
        await client.query(
          "update app_state set payload = $2::jsonb, updated_at = now() where id = $1",
          [appStateKey, JSON.stringify(normalizeData(data))]
        );
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw mapDbError(error);
    }
  }

  return withFileLock(async () => {
    const data = await readFromFile();
    const result = await mutator(data);
    await writeToFile(data);
    return result;
  });
};
