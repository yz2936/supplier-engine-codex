import { cp } from "node:fs/promises";
import path from "node:path";

const src = path.join(process.cwd(), "data", "app-data.json");
const dst = path.join(process.cwd(), "data", "app-data.seeded.json");

await cp(src, dst);
console.log(`Seed snapshot written to ${dst}`);
