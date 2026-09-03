# Quickstart: Validating the Process Map Documented Cards

## Prerequisites

- Dev database seeded: `pnpm db:seed` (seeds Acme Industrial with Purchase-to-Pay
  (PUR101) — 9 steps across 3 lanes, including a decision with a $10,000 approval
  threshold, an SLA on several steps, and a cross-process link to PUR102/SAL101 — the
  exact scenario the approved mockup was built against).
- Dev server running: `pnpm dev`.

## Manual validation

1. **Live canvas (User Stories 1–3)**
   Sign in (seeded Firm Owner credentials are pre-filled on `/login`) → Acme Industrial →
   Purchase-to-Pay → Process Map.
   - Every step card is readable without zooming; the canvas is exactly as tall as the
     3 lanes need (no clipping, no shrink-to-fit).
   - "Create Purchase Order" and other steps with an SLA show it on the card; "Send PO to
     Vendor" (which links to PUR102 and SAL101) shows its hand-off; a step with neither
     shows the neutral "not set" indicator.
   - "Approve PO?" reads as a decision at a glance (not a task) and shows its $10,000
     threshold.
   - Drag-to-reorder, dragging a step to another lane, and the Steps List edit form still
     work exactly as before (this feature does not touch that code path).

2. **Printed/PDF Export Report (User Story 4)**
   Acme Industrial → Export Report → include Purchase-to-Pay → Preview report → Print /
   Save as PDF (or open the on-screen preview, which is laid out at true print scale).
   - The Process Map section for PUR101 uses the same card treatment as the live canvas.

3. **PowerPoint export (User Story 4)**
   Same Export Report page → Download PPTX → open the deck.
   - PUR101's "Process Map & Narrative" slide uses the same card treatment, drawn as
     native PowerPoint shapes (not a screenshot).

## Automated validation

- `pnpm exec vitest run` — any new/changed pure logic (the `stepId`-keyed authority
  lookup) gets unit coverage alongside the existing `lib/domain` tests.
- `pnpm exec playwright test` — extend `tests/e2e/core-workflows.spec.ts` (or a new spec)
  to assert the redesigned card content (step number, role, SLA chip, hand-off chip,
  decision threshold) renders from real seeded data; extend
  `tests/e2e/accessibility.spec.ts`'s existing "Process Map (Diagram view)" axe-core check
  continues to pass against the new markup (Constitution Principle IV — non-negotiable,
  not just a nice-to-have here since card color now carries step-type meaning that must
  not be color-only).
- `tests/e2e/report-diagram.spec.ts` / `report-print.spec.ts` — extend for the static
  diagram's new card treatment (width/height, "Unassigned" lane still drawn, etc.),
  mirroring the existing wide-process and unassigned-lane tests.
- `tests/e2e/export.spec.ts` — the PPTX test already downloads and structurally validates
  the deck; extend or add a check that the process-map slide's shape count/labels reflect
  the new card content (e.g. via the same `python-pptx`-style structural check used during
  the PPTX feature's own verification, or a lighter shape-count assertion reachable from
  Playwright/Node directly).

## Done means

- All items in spec.md's Acceptance Scenarios (User Stories 1–4) hold against the seeded
  Purchase-to-Pay process on all three surfaces.
- `pnpm run lint`, `pnpm run build`, `pnpm exec vitest run`, `pnpm exec playwright test`
  all pass.
- No new Prisma migration exists (this feature reads existing fields only).
