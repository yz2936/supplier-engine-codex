# Stainless Logic Sidecar MVP

Functional local MVP built from `project.md`.

## What works
- Standard SaaS auth flow:
  - Email/password login
  - Account registration
  - Session cookie auth (`/api/auth/*`)
  - First-run onboarding (name, company, role)
- Role-based access control (server + UI):
  - Sales Rep: parse/price/save own quotes
  - Inventory Manager: inventory uploads + surcharge updates
  - Sales Manager: all quote visibility + inventory + pricing operations
- RFQ text ingestion and parsing (OpenAI structured output if `OPENAI_API_KEY` is set; otherwise deterministic local parser)
- Gauge-to-decimal conversion and geometry-based weight estimate
- Inventory CSV upload and snapshot replacement
- Fuzzy matching across grade/thickness/width/length/finish with 304/304L dual-cert logic
- Traffic-light stock status (green/yellow/red)
- Pricing engine: `(base price + surcharge) * weight * margin multiplier`
- Margin slider with real-time recalculation
- Quote draft generation with copy-to-email output
- Quote logging and status tracking (Draft/Sent/Won)
- Role-based UI enforcement (Sales Rep / Inventory Manager / Sales Manager)
- AI Copilot chat window for natural-language instructions:
  - `Set margin to 18%`
  - `Customer is Apex Metalworks`
  - `Parse and price this RFQ`
  - `Save quote`
  - Upload `CSV` inventory files or `TXT/EML/MD` RFQ files from chat
- Buyer response routing:
  - Outbound quote emails include manager routing tag in subject.
  - Inbound buyer replies can be posted to `/api/email/inbound`.
  - Replies are auto-routed to the sales manager, creating/updating buyer profiles and conversation threads.

## Run locally (macOS)
1. Install dependencies:
   ```bash
   npm install
   ```
2. Optional AI extraction (otherwise local heuristic parser is used):
   ```bash
   cp .env.example .env.local
   # add OPENAI_API_KEY
   ```
3. Start app:
   ```bash
   npm run dev
   ```
4. Open:
   `http://localhost:3000`

## Inventory upload format
Use `data/sample-inventory.csv` or any CSV with this exact header:
`sku,category,grade,thickness,width,length,finish,weightPerUnit,basePrice,qtyOnHand`

## Supabase schema
Supabase-ready SQL is included in `supabase-schema.sql`.

## Notes
- This MVP uses local file persistence in `data/app-data.json` so it runs out-of-the-box.
- To move to Supabase, replace `src/lib/data-store.ts` with Supabase client calls and keep API contracts unchanged.
- Default demo users (password: `Password123!`):
  - `sam.rep@stainless.local`
  - `ivy.inventory@stainless.local`
  - `mia.manager@stainless.local`
- Optional inbound webhook protection:
  - Set `INBOUND_EMAIL_SECRET` and send matching `x-inbound-secret` header to `/api/email/inbound`.
