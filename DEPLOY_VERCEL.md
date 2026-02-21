# Deploy on Vercel (User Testing)

## 1) Push repo and import to Vercel
- Create a new Vercel project from this repository.
- Framework preset: `Next.js`.
- Build command: `npm run build` (already configured).

## 2) Set Environment Variables (Vercel Project Settings)
Required (choose at least one LLM backend):
- `OPENAI_API_KEY` (if using OpenAI)
- `DEEPSEEK_API_KEY` (if using DeepSeek)
- `LLM_PROVIDER` = `openai` or `deepseek`

Optional model overrides:
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `DEEPSEEK_MODEL` (default: `deepseek-chat`)

Email (for quote/sourcing send):
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Inbound routing/sync:
- `INBOUND_EMAIL_SECRET`
- `INBOUND_ROUTE_ADDRESS`
- `IMAP_HOST`
- `IMAP_PORT`
- `IMAP_SECURE`
- `IMAP_USER`
- `IMAP_PASS`
- `INBOUND_LLM_FILTER`
- `INBOUND_FILTER_MODEL`

Raw material optional:
- `RAW_MATERIAL_API_URL_TEMPLATE`
- `RAW_MATERIAL_API_KEY`
- `RAW_MATERIAL_API_KEY_HEADER`

## 3) Data storage note (important)
- This app currently defaults to file data storage.
- On Vercel, writes are redirected to `/tmp/app-data.json` so the app runs without crashes.
- `/tmp` is ephemeral, so data is not guaranteed durable across cold starts/redeploys.

For stable long-running production testing:
- Move app data to a persistent DB/KV (recommended next step).

## 4) Deploy
- Trigger deploy from Vercel dashboard.
- After deploy, verify:
  - login works
  - parse/chat works
  - email send works
  - inbound sync works
  - dashboard loads

