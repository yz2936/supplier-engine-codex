# CODEX_WORKFLOW.md

## Current Product State
The product is a working supplier-side quoting workflow with real end-to-end breadth.

It is strongest in:
- workflow coverage
- domain specificity
- fallback intake paths

It is weakest in:
- UX consistency
- frontend orchestration complexity
- interaction clarity
- reliability of implicit behaviors


## Current Objective
Do not expand feature breadth unless explicitly requested.

Current priority is to make the core intake-to-quote path:
- explicit
- reliable
- predictable
- traceable

## Product Principles
- Explicit user action is better than hidden automation.
- Users must always know the source of a quote.
- Reliability is more important than adding new surfaces.
- The UI should reduce ambiguity, not introduce it.
- The system should expose what was extracted, excluded, and marked ambiguous.

## Current Priorities
1. Stabilize Buyer → Quote Desk → Sourcing handoff
2. Make intake provenance explicit
3. Standardize item identification outputs
4. Refactor Quote Desk into smaller components
5. Improve error and empty states
6. Add observability for parse, sync, routing, and send failures

## Do Not Expand Right Now
- dashboard complexity
- supplier insights
- broad AI copilot behaviors
- advanced sourcing automation
- new workflow surfaces

## Required Working Pattern
For any medium or large task:
1. plan first
2. identify affected files
3. explain assumptions
4. implement in small steps
5. validate regressions
6. report risks and follow-ups

## Good Changes
- remove implicit latest-email behavior
- split Quote Desk into smaller view components
- make parsing outputs more explicit
- add provenance labels
- reduce client-side workflow orchestration

## Bad Changes
- add new dashboard widgets
- add broad AI assistant actions
- hide more workflow behavior behind automatic triggers
- increase state duplication across frontend and backend