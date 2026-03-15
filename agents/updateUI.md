# Quote Desk UI Wireframe Spec

## Goal

Redesign the main Quote Desk into a simpler, calmer, more trustworthy workspace for industrial quoting.

This UI must make it easy for a sales rep or estimator to:

1. understand exactly what RFQ source is being quoted
2. review what the system extracted
3. inspect technical specifications line by line
4. compare inventory matches and shortages
5. adjust pricing if needed
6. approve and send with confidence

The new Quote Desk should feel like a focused operational workstation, not a crowded internal tool.

---

## Product Principles

### 1. Explicit over implicit
- Never auto-open the “latest email”
- Never hide which source created the quote
- Never silently exclude quoteable content
- Always show provenance, extracted items, ambiguous lines, and ignored lines

### 2. Calm, high-trust interface
- Reduce visual noise
- Use one main workspace
- Keep actions obvious
- Show what the system knows and what it is unsure about

### 3. Progressive disclosure
- Default to readable summaries
- Let users expand into technical detail
- Avoid dumping every attribute at once

### 4. Preserve existing behavior
This redesign should improve layout, hierarchy, clarity, and interaction flow without breaking current system logic.

---

## High-Level Layout

Use a 3-column desktop workspace with a fixed header and a fixed bottom action bar.

### Desktop layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Header: Quote Desk / Buyer / RFQ source / status / workflow stepper         │
├───────────────┬───────────────────────────────┬──────────────────────────────┤
│ Left Panel    │ Center Panel                  │ Right Panel                  │
│ RFQ Source    │ Parsed Items + Spec Review    │ Inventory + Pricing + Quote │
│ 24% width     │ 38% width                     │ 38% width                    │
├───────────────┴───────────────────────────────┴──────────────────────────────┤
│ Bottom Action Bar: Preview Quote / Approve / Send / Create Sourcing Request │
└──────────────────────────────────────────────────────────────────────────────┘