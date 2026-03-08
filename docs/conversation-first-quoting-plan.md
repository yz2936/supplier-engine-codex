# Conversation-First Quoting Plan

## Phase 1: Current Audit

- Existing RFQ parsing already lives in `src/lib/parser.ts`.
- Inventory matching and pricing already live in `src/lib/matcher.ts` and `src/lib/pricing.ts`.
- Buyer email retrieval already exists through buyer profiles and `buyerMessages` in the app data model.
- Outbound quote sending already exists in `src/app/api/quote-email/route.ts`.
- The previous chat panel was generic and not a true workflow orchestrator.

## Phase 2: Target Architecture

### Frontend

- Primary dashboard surface becomes a conversation desk.
- Chat remains the main control plane.
- Structured cards render alongside chat:
  - email preview
  - RFQ extraction
  - inventory comparison
  - draft quote preview
  - exceptions / risk
  - approval state
  - audit timeline

### Backend

- Dedicated orchestration routes:
  - `GET /api/agent/quote`
  - `POST /api/agent/quote`
  - `POST /api/agent/quote/[id]/approve`
- Shared quote-send service extracted into `src/lib/quote-email-service.ts`.
- Persistent quote agent sessions added to app state for continuity and auditability.

### Agent / tools

- Current implementation uses a bounded orchestration layer in `src/lib/quote-agent.ts`.
- Effective tool chain:
  - get latest buyer email
  - filter for buying intent
  - parse RFQ
  - check inventory
  - build quote draft
  - request approval
  - send quote email only after approval

## Data Contracts

### Session

- `QuoteAgentSession`
  - workflow stage
  - workflow status
  - conversation messages
  - UI cards
  - activity log
  - pending approval
  - quote draft

### Cards

- `QuoteUiCard`
  - `email_preview`
  - `rfq_extraction`
  - `inventory_match`
  - `quote_preview`
  - `risk_alert`
  - `approval`

### Approval

- `QuoteApprovalRequest`
  - type
  - title
  - detail
  - status

## Main User Flows

### Quote latest buyer email

1. User opens dashboard.
2. User types: `Quote the latest email from the buyer.`
3. Agent finds the latest relevant inbound buyer email.
4. Agent parses RFQ content.
5. Agent checks inventory and pricing.
6. Agent renders structured review cards.
7. Agent requests approval before sending.
8. User approves.
9. System sends quote and logs the action.

### Revise in conversation

- `Show me the buyer email again.`
- `Use the second line item only.`
- `Don't include the out-of-stock items.`
- `Change line 2 quantity to 5.`
- `Change the lead time to 8 weeks.`
- `Draft a more concise email.`

## State Model Updates

- `AppData.quoteAgentSessions`
- Session contains:
  - source message ids
  - current draft
  - approvals
  - activities
  - rendered cards

## API Design

### `GET /api/agent/quote`

- Returns recent quote sessions for the current user.

### `POST /api/agent/quote`

- Input:
  - `sessionId?`
  - `command`
- Output:
  - updated `session`

### `POST /api/agent/quote/[id]/approve`

- Approves pending outbound send.
- Executes guarded send.
- Returns updated `session`

## Tradeoffs

- This implementation reuses current parsing, inventory, pricing, and email paths rather than replacing them.
- The orchestration layer is deterministic and bounded rather than a fully open-ended autonomous agent.
- Attachment text is only available when present in intake/parsing flows; buyer inbox records currently persist attachment metadata, not attachment content.

## Phase 3: Implemented MVP

- Conversation-first dashboard module
- Persistent quote agent sessions
- Structured UI cards tied to workflow stages
- Approval modal before outbound send
- Activity timeline and conversation memory for the active session

## Phase 4: Next Hardening Steps

- Add attachment text retrieval into buyer message records for richer email-to-RFQ flows
- Add quote thread linking to sent quote history
- Add optimistic UI loading states per tool step
- Add automated tests around orchestration transitions and approval gating
- Extend tool set to supplier contact and internal pricing overrides under separate approvals
