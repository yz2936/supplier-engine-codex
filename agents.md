# AGENTS.md

## Product
This is an industrial RFQ quoting application for supplier-side teams.

The core workflow is:
RFQ intake → item identification → inventory match → quote draft → approval → send → sourcing handoff

## Stack
- Next.js
- React
- TypeScript
- Tailwind
- Supabase / Postgres
- Vercel

## Important Directories
- src/app: routes and app-level UI
- src/components: UI components
- src/lib: domain and shared logic
- src/app/api: server routes
- docs: product and architecture docs
- scripts: helper scripts
- data: local seeded data

## Do Not Edit Unless Explicitly Needed
- .next
- node_modules
- package-lock.json unless dependencies change
- .env.local

## Global Rules
- Prefer small, reviewable changes.
- Keep business rules explicit.
- Do not add hidden automation.
- Keep TypeScript types accurate.
- Preserve Tailwind and component consistency.
- Prefer backend/domain modules for workflow logic over large client components.
- Do not introduce new libraries unless necessary.

## Preferred Ownership
- Planning work: docs/, plans/
- Frontend work: src/components, src/app
- Backend work: src/app/api, src/lib, server-side workflow modules
- Data model work: types.ts, data-store.ts, schema files
- Deployment work: vercel.json, deployment docs, build config

---

# Directory Structure

src/ → application code  
docs/ → documentation  
data/ → sample data and structured inputs  
scripts/ → helper scripts  
public/ → static assets  

Do not modify build artifacts:

.next/
node_modules/

---

# Coding Rules

- Keep TypeScript strict
- Avoid breaking existing APIs
- Prefer small focused commits
- Reuse existing components where possible
- Maintain Tailwind design consistency

---

# Verification Before Completing Tasks

Always run:

npm run lint  
npm run build  

If backend logic changes:

verify Supabase queries.

---

# Definition of Done

A task is complete when:

1. code compiles
2. lint passes
3. build succeeds
4. changed files are listed
5. risks are explained