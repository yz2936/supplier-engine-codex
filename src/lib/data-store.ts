import { promises as fs } from "node:fs";
import path from "node:path";
import { AppData } from "@/lib/types";
import { hashPassword, normalizeEmail } from "@/lib/security";

const resolveDataPath = () => {
  const configured = process.env.DATA_PATH?.trim();
  if (configured) return configured;
  // Vercel filesystem is read-only except /tmp.
  if (process.env.VERCEL) return path.join("/tmp", "app-data.json");
  return path.join(process.cwd(), "data", "app-data.json");
};

const dataPath = resolveDataPath();

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

export const readData = async (): Promise<AppData> => {
  try {
    const raw = await fs.readFile(dataPath, "utf8");
    return normalizeData(JSON.parse(raw) as AppData);
  } catch {
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
};

export const writeData = async (data: AppData) => {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
};
