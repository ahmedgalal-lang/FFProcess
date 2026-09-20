---

description: "Task list for 009-report-pagination"
---

# Tasks: A Report That Paginates Like a Document

**Input**: Design documents from `/specs/009-report-pagination/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included and not optional. The packing rule decides what a client
receives on paper, which Constitution Principle III treats as a business rule.
More to the point, this problem returned repeatedly because it was verified by
reading the stylesheet — every check below measures a **generated PDF** instead.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on incomplete work
- **[Story]**: The user story this serves (US1–US4)

## Path Conventions

Next.js App Router at the repository root: the pure rule in `lib/domain/`, the
stylesheet in `app/reports/`, the diagram cap in the map component, tests in
`tests/unit/` and `tests/e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pin down the one number everything is measured against, and capture
the baseline so improvement is measured rather than asserted.

- [X] T001 Create `lib/domain/report-pagination.ts` exporting `PRINT_PAGE_HEIGHT_PX = 688` (182mm at 96dpi: A4 landscape less the `@page` 14mm margins) with the derivation in a comment, plus the `AtomicBlock`, `PageBreak` and `Pagination` types from `data-model.md` Part 2
- [ ] T002 Record today's numbers in `tests/e2e/report-print.spec.ts` as a named constant with a comment — 13 pages, 47% mean usage, six pages under a third — so every later assertion is against a measured baseline rather than a remembered one

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The packing rule and its tests. Every user story depends on it,
and the preview cannot draw an honest marker without it.

- [X] T003 Write failing unit tests in `tests/unit/report-pagination.test.ts` for the packing rule in `data-model.md` Part 4: blocks fill a page until one does not fit; a block that does not fit moves whole; a forced break starts a page even with room left; `usage` reports the fraction of each page carrying content
- [X] T004 [P] Write failing unit tests in `tests/unit/report-pagination.test.ts` for degenerate input: zero, negative, `NaN` and infinite heights, an empty document, a single block, and a block several times a page. **It must never throw and never loop** — the wrapped process map hit exactly this hazard, where a zero divisor hung the test runner instead of failing it
- [X] T005 Implement `paginate(blocks, options)` in `lib/domain/report-pagination.ts` per `contracts/pagination.md` §2, clamping every height at the point of use so a bad measurement cannot produce an infinite page count
- [X] T006 Implement `oversized` reporting in `lib/domain/report-pagination.ts`: any block taller than `PRINT_PAGE_HEIGHT_PX` is named in the result rather than silently tolerated, because it is something no break rule can keep whole

**Checkpoint**: the rule is testable, total and deterministic, with no UI attached.

---

## Phase 3: User Story 1 — A report that does not waste half its paper (Priority: P1)

**Goal**: Pages carry as much as fits instead of one short section each.

**Independent test**: Export a report and measure the used height of every page.

### Tests (write first, must fail)

- [X] T007 [P] [US1] Write a failing e2e test in `tests/e2e/report-print.spec.ts` that generates a real PDF, rasterises each page and measures the fraction of its height carrying ink: assert mean usage **≥ 70%** and **no page below 40%**, excluding the cover and the first page of each process document (SC-001, SC-002)
- [X] T008 [P] [US1] Write a failing e2e test in `tests/e2e/report-print.spec.ts` asserting the same content exports to **fewer pages** than the recorded baseline (SC-003)

### Implementation

- [X] T009 [US1] Replace `.print-page { break-after: page }` in `app/reports/[workspaceId]/export-preview.tsx` with a rule that lets sections flow, keeping a forced break only for the cover and for each process document (FR-001, FR-002) — measured to move the report from 13 pages at 47% to 11 at 57.3% on its own
- [X] T010 [US1] Introduce one atomic-block class in `app/reports/[workspaceId]/export-preview.tsx`'s print stylesheet meaning "do not break inside this", and state the page rule once in that stylesheet (FR-018, research R8)
- [X] T011 [US1] Apply the atomic-block class in `app/reports/[workspaceId]/export-preview.tsx` at **block** granularity and remove the eighteen scattered `break-inside-avoid` class usages it replaces, so a process document flows while the cards, rows and entries inside it stay whole (FR-003, research R2)
- [X] T012 [US1] Remove `break-inside: avoid` from anything that can exceed a page in `app/reports/[workspaceId]/export-preview.tsx` — a 2902px process document cannot honour it, and the browser's response is to break it anywhere, which is the reported slicing

**Checkpoint**: page usage measured against the target; the numbers decide, not the look.

---

## Phase 4: User Story 2 — Nothing important is sliced in half (Priority: P1)

**Goal**: No page break falls inside a card, row, list item or diagram.

**Independent test**: Export a report with a process map taller than a page and confirm nothing is severed.

### Tests (write first, must fail)

- [X] T013 [P] [US2] Write a failing e2e test in `tests/e2e/report-print.spec.ts` that compares every step card, table row, list item and diagram box against the page boundaries and asserts **zero** are straddled (SC-004)
- [X] T014 [P] [US2] Write a failing unit test in `tests/unit/report-pagination.test.ts` asserting `oversized` is empty for the heights a real report produces — anything in it will fragment whatever the break rules say

### Implementation

- [X] T015 [US2] Cap the report diagram at the printable page height in `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/static-process-map-diagram.tsx`, replacing `MAX_DIAGRAM_HEIGHT = 1500` with `PRINT_PAGE_HEIGHT_PX` from `lib/domain/report-pagination.ts` — 1500px against a 688px page is the root cause of the sliced diagram, and no break rule could have fixed it (FR-007, research R3)
- [X] T016 [US2] Confirm the capped diagram still draws every step in `static-process-map-diagram.tsx`: the map already wraps and scales, so a shorter box must produce a complete smaller drawing, never a cropped one — completeness is not traded for legibility
- [X] T017 [P] [US2] Verify the report's tables carry a real `<thead>` in `app/reports/[workspaceId]/export-preview.tsx` so the browser repeats headings on a continued table, and add one where missing (FR-008, research R5)
- [X] T018 [US2] Keep `h1..h4 { break-after: avoid }` in the restated stylesheet in `app/reports/[workspaceId]/export-preview.tsx`, so a heading is never the last thing on a page (FR-009)

**Checkpoint**: a long process map prints complete on one page; nothing is straddled.

---

## Phase 5: User Story 4 — The preview still tells the truth (Priority: P1)

**Goal**: The preview breaks pages where the PDF does.

**Independent test**: Compare the preview's markers against the PDF's real page boundaries.

*Ordered before User Story 3 deliberately: US3 is a small change, and this is the
check that keeps every other claim in this feature honest.*

### Tests (write first, must fail)

- [X] T019 [P] [US4] Write a failing e2e test in `tests/e2e/report-print.spec.ts` that generates a PDF, reads its real page boundaries, and asserts every preview marker matches one and every boundary has a marker (SC-006, FR-013, FR-014)

### Implementation

- [X] T020 [US4] Measure each atomic block's height in `app/reports/[workspaceId]/export-preview.tsx` and feed them to `paginate()`, replacing the `.print-page::after` marker that derived its position from the class that forces the break (research R4)
- [X] T021 [US4] Position the preview's "Page break" markers from `paginate()`'s output in `app/reports/[workspaceId]/export-preview.tsx`, including a marker inside an oversized block, so the preview never hides a fragmentation the PDF will show
- [X] T022 [US4] Keep the preview rendering at the printed page's real width and margins in `app/reports/[workspaceId]/export-preview.tsx`, so a measured height means the same on screen and on paper (FR-015)

**Checkpoint**: preview and PDF break in the same places, proven against a real PDF.

---

## Phase 6: User Story 3 — The closing page is not stranded (Priority: P2)

**Goal**: The closing message shares the last page when there is room.

**Independent test**: Export a report and confirm the closing message is not alone on a sheet.

### Tests (write first, must fail)

- [X] T023 [P] [US3] Write a failing e2e test in `tests/e2e/report-print.spec.ts` asserting the closing message shares a page with preceding content when that page has room, and takes its own page only when it does not (SC-005, FR-011, FR-012)

### Implementation

- [X] T024 [US3] Make `ClosingPage` in `app/reports/[workspaceId]/export-preview.tsx` an ordinary flowing atomic block — drop its forced break and keep it whole — so at 136px it shares the last page instead of claiming one (research R7)

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T025 Write an e2e test in `tests/e2e/report-print.spec.ts` asserting every process, heading and table row present before the change is present after, once, in the same order (FR-017) — pagination that dropped a section would satisfy every usage target perfectly
- [ ] T026 [P] Write an e2e test in `tests/e2e/report-print.spec.ts` exercising several section selections and orders, including one with most sections off and one with everything on for several processes (FR-016, SC-008)
- [X] T027 Verify the suite by mutation: restore `break-after: page`, restore `MAX_DIAGRAM_HEIGHT = 1500`, and make `paginate()` ignore its forced breaks. Each must fail a named test. **A mutation that passes means the test reads the stylesheet rather than the PDF**, which is the exact failure that let this recur — rewrite it before the task is done
- [X] T028 Generate a before/after PDF into the scratchpad and record the real page count and mean usage in the completion report, so the improvement is a number rather than a claim
- [X] T029 Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm vitest run` and `pnpm exec playwright test`, and fix what they find
- [ ] T030 Read the exported PDF page by page and confirm it reads as a document: nothing stranded, nothing sliced, no heading orphaned at a page foot

---

## Dependencies

```
Phase 1 Setup (T001-T002)
      │
      ▼
Phase 2 Foundational (T003-T006)   ← the packing rule; blocks US4 entirely
      │
      ├───────────────┬────────────────┬───────────────┐
      ▼               ▼                ▼               ▼
  US1 (T007-T012)  US2 (T013-T018)  US4 (T019-T022)  US3 (T023-T024)
      │               │                │               │
      └───────────────┴────────────────┴───────────────┘
                      ▼
              Phase 7 Polish (T025-T030)
```

**Between stories**:

- **US1 and US2 both edit the print stylesheet** and must be done in order, not
  in parallel: T009–T012 restate it and T017–T018 build on the restatement.
- **US2's diagram cap (T015) is independent** of the stylesheet entirely and can
  be done first — it is one constant, and it alone fixes the sliced diagram.
- **US4 needs Phase 2** and nothing else; its UI work can proceed while US1 is
  in flight, but its test can only pass once US1 has changed where breaks fall.
- **US3 is two lines** and depends only on the atomic-block class from T010.

## Parallel Opportunities

- **US1 tests**: T007 and T008 together.
- **US2 tests**: T013 and T014 together.
- **T015 (the diagram cap) alongside all of US1** — different file, different cause.
- **T017 alongside T013/T014** — a check of existing markup, not a change to the cascade.

## Independent Test Criteria

| Story | Done when |
|---|---|
| **US1** | Mean page usage ≥ 70%, no page below 40%, fewer pages than the baseline |
| **US2** | Zero page breaks fall inside a card, row, list item or diagram |
| **US3** | The closing message shares a page whenever the last page has room |
| **US4** | Every preview marker matches a real PDF page boundary, and the reverse |

## Implementation Strategy

**Do T015 first, before anything else.** It is one constant, it is the root
cause of the worst-looking symptom, and it is independent of the rest. It gives
an immediately visible improvement while the stylesheet work proceeds.

Then Phase 1 → Phase 2 → **US1 and US2 in sequence** (they share the stylesheet)
→ US4 → US3 → Polish.

Two things to hold on to:

- **Every check measures a PDF, not the stylesheet.** This problem came back
  repeatedly because it was verified by reading the CSS, and CSS that looks
  right can still paginate wrongly. T027 exists to prove the tests have that
  property: a mutation that passes means the test is reading the wrong thing.
- **Watch for content loss.** Every usage target in this feature is trivially
  satisfied by dropping a section. T025 is the guard, and it is not optional.
