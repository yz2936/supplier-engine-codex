# PRD: Stainless Logic – AI-Driven RFQ Sidecar Assistant

---

# 1. Executive Summary

**Stainless Logic** is a specialized B2B SaaS tool built for mid-to-large stainless steel distributors. It solves the “Data Bottleneck” problem by using AI to parse unstructured RFQs (Requests for Quote) from emails, PDFs, and Excel files, and instantly match them against real distributor inventory.

The product eliminates manual data entry, SKU lookup fatigue, and pricing delays. It allows sales representatives to generate accurate, inventory-backed quotes in seconds rather than hours.

Stainless Logic operates as a **“Sidecar” application**, meaning it works alongside existing ERP systems without replacing them.

---

# 2. Product Scope: Industrial Inventory Coverage

The system must support a full-scale stainless steel distributor catalog.

## 2.1 Flat Rolled Products
- Coils
- Sheets
- Plates

## 2.2 Long Products
- Round Bars
- Flat Bars
- Hex Bars
- Square Bars
- Angles
- Channels

## 2.3 Tubular Products
- Ornamental Tubing
- Structural Tubing
- Pipe (Sanitary & Schedule)
- Fittings

## 2.4 Key Variables to Support
- Grades: 304, 304L, 316, 316L, 430, etc.
- Finishes: 2B, #4, BA, HRAP
- Gauges / Thickness: Decimal and Fractional
- Width & Length
- Mill Certifications (MTR references)
- Quantity in Pieces or Pounds

---

# 3. User Personas

## 3.1 Sales Representative
- Receives 50+ RFQ emails daily
- Needs instant SKU matching
- Must quote quickly to win bids
- Requires margin flexibility

## 3.2 Inventory Manager
- Uploads daily or weekly inventory snapshots
- Exports CSV/Excel from ERP
- Maintains SKU master list

## 3.3 Sales Manager
- Monitors quote activity
- Tracks win rates
- Reviews margin trends
- Needs visibility into historical pricing

---

# 4. Functional Requirements

---

## 4.1 Ingestion & Extraction (The "Parser")

### Input Methods
- Paste raw email text
- Upload PDF RFQ
- Drag-and-drop Excel bid list

### AI Extraction Logic

Use an LLM (GPT-4o / Claude 3.5 equivalent) to extract:

- **Category** (e.g., Sheet, Pipe, Round Bar)
- **Grade** (e.g., 304L)
- **Specifications** (e.g., 16ga x 48 x 120)
- **Finish** (e.g., #4)
- **Quantity** (e.g., 25 pcs, 5,000 lbs)

### Additional Extraction Rules
- Convert gauges to decimal equivalents
  - Example: 11ga → 0.120"
- Recognize 304 and 304L as dual-certified matches unless otherwise specified
- Calculate total weight if dimensions and quantity are provided
- Return structured JSON output

---

## 4.2 Inventory Mapping (The "Matcher")

### CSV Upload
- Users upload a Master Inventory file (CSV/Excel)
- System parses and stores inventory snapshot

### Matching Logic
- Fuzzy matching on:
  - Grade
  - Thickness (decimal tolerance)
  - Width
  - Length
  - Finish

Example:
If customer requests:
> 304 Sheet 0.060

System must match:
> SH304-16GA-48120

Even if format differs.

### Stock Status Indicators
- **Green**: In Stock
- **Yellow**: Partial Stock
- **Red**: Out of Stock (Suggest Alternative)

---

## 4.3 Pricing Engine

The system generates a Suggested Quote using:

Quote Price = (Base Price + Surcharge) × Weight × Margin Multiplier


### Components

**Base Price**
- Stored per SKU in inventory

**Surcharge**
- Managed monthly by grade
- Editable via dashboard

**Weight Calculation**
Steel density:
Steel Density = 0.284 lb/in³


Weight must be calculated using theoretical geometry when required.

**Margin Multiplier**
- Adjustable via UI slider
- Real-time price recalculation

---

## 4.4 Quote Generation (The "Output")

### Draft Generator
- One-click "Copy to Email"
- Generates professional table format
- Includes:
  - Item description
  - Quantity
  - Unit price
  - Extended price
  - Terms

### CRM Logging
- All generated quotes saved
- Searchable historical pricing
- Status tracking:
  - Draft
  - Sent
  - Won

---

# 5. Technical Architecture (Sidecar Model)

| Component | Technology | Role |
|------------|------------|------|
| Frontend | React / Next.js (Tailwind CSS) | Fast industrial dashboard |
| Backend | Node.js OR Python (FastAPI) | Pricing logic & CSV processing |
| Database | Supabase (Postgres) | Stores inventory & quote history |
| AI Layer | OpenAI API (Structured Outputs) | Converts messy email → structured JSON |
| Security | Clerk or Auth0 | Role-based authentication |

---

# 6. Data Model (Entity Relationships)

## Users
- ID
- Name
- Role
- CompanyID

## InventoryItems
- SKU
- Category
- Grade
- Thickness
- Width
- Length
- Finish
- WeightPerUnit
- BasePrice
- QtyOnHand

## Surcharges
- Grade
- Month_Year
- ValuePerLB

## Quotes
- ID
- CustomerName
- ItemsQuoted
- TotalPrice
- Status (Draft / Sent / Won)
- CreatedAt

---

# 7. System Prompt for Extraction Agent

When building the AI extraction tool, use the following logic:

You are an Industrial Stainless Steel Expert.

Your task is to extract structured product data from messy RFQ emails.

Rules:

Always convert gauge values to decimal equivalents.

Recognize 304 and 304L as dual-certified unless specified.

Extract category, grade, finish, dimensions, and quantity.

If dimensions and quantity are provided, calculate total weight.

Return the output as a valid JSON array of objects.


---

# 8. UI / UX Requirements

---

## 8.1 Split-Screen Workspace

Left Side:
- Raw email text or PDF preview

Right Side:
- Smart Table of extracted line items
- Editable fields

---

## 8.2 Traffic Light Alerts

- 🟢 Green: Perfect match + In stock
- 🟡 Yellow: Match found but limited stock
- 🔴 Red: Not found or incompatible

---

## 8.3 Price Slider

Interactive margin adjustment:
- Slider changes margin %
- Quote total updates in real-time
- Visual feedback for price sensitivity

---

# 9. Future Roadmap

---

## Version 2

### MTR Search
- Drag-and-drop Heat Number
- Retrieve Mill Test Report PDF

### Market Analytics
- Trend analysis of grade substitution
- Detect shift from 316 to 304 due to surcharge spikes

---

## Version 3

### EDI Integration
- Push accepted quote to ERP
- Auto-convert Quote → Sales Order

---

# 10. Instructions for Coding Agent

1. Initialize a Next.js project with Tailwind CSS.
2. Set up Supabase tables using schema from Section 6.
3. Create a FileUpload component for CSV inventory imports.
4. Build Text Parser using OpenAI API with structured output.
5. Implement fuzzy SKU matching logic.
6. Implement pricing formula in Section 4.3.
7. Build split-screen UI layout.
8. Add margin slider with real-time recalculation.
9. Implement quote logging and status tracking.
10. Ensure system returns structured JSON and persists quotes.

---

# MVP Definition of Done

The MVP is complete when:

- A user can paste an RFQ email
- The system extracts structured line items
- Inventory matches are displayed with stock status
- Suggested quote pricing is calculated
- Margin can be adjusted dynamically
- A professional draft quote can be generated
- Quote is logged in database
- Role-based access is enforced

---

END OF PRD
