# Implementation Plan: A Report That Paginates Like a Document

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-report-pagination/spec.md`

## Summary

Stop every report section claiming a page of its own. Sections flow; only the
cover and each process document start a page. What may not be broken becomes
the **block** rather than the section, because a process document is four times
a page and asking it not to break internally is asking the impossible — which is
why the browser has been breaking it through the middle of step cards.

Three measured facts drove the whole plan:

1. Letting sections flow — one declaration — takes the report from **13 pages,
   47% mean usage** to **11 pages, 57.3%**. So flowing is right, and most of the
   answer.
2. A process document measures **2902 px against a 688 px page**. No break rule
   can hold it whole; the granularity has to change.
3. The report's diagram is capped at **1500 px — 2.2 times a printable page**.
   That single number is the root cause of the sliced diagram, and no break rule
   could ever have fixed it. Every previous attempt tuned rules around it.

The fourth problem is the one that makes the rest hard. The preview draws its
page-break marker from *the same class that forces the break*, so preview and
PDF agree today only because both break after every section. Once sections flow,
that agreement evaporates — CSS fragmentation decides breaks at paint time and
tells the DOM nothing. So a small pure function packs measured block heights
into 688 px pages, the preview draws its markers from it, and an end-to-end test
checks its answers against the real page boundaries of a generated PDF.

No migration. No new dependency.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20, React 19.2

**Primary Dependencies**: Next.js 16.3 (App Router). Pagination is CSS
fragmentation in the browser's own print engine — no PDF library is involved on
this path

**Storage**: none. Pagination is computed per render and never persisted

**Testing**: Vitest for the packing function (pure, no DOM); Playwright for the
printed result, generating a real PDF and measuring its pages

**Target Platform**: Chrome's print engine, via the browser's Print to PDF

**Project Type**: Web application — Next.js App Router

**Performance Goals**: the preview stays interactive while measuring; a report
of a dozen processes paginates without a visible pause

**Constraints**: the printable page is **688 px (182 mm)** and everything is
measured against it. Preview and PDF must break in the same places (FR-013).
Pagination must hold for any section selection in any order (FR-016)

**Scale/Scope**: 6 pack sections, 4 process sections, 11 blocks, any number of
processes. One new pure module, one stylesheet rewritten, one constant changed

## Constitution Check

*GATE: passed before Phase 0. Re-checked after Phase 1 — still passing, with one
justified deviation recorded below.*

| Principle | How this complies |
|---|---|
| **I. Type-Safe Full-Stack** | The packing function's inputs and outputs are explicit types; measured heights cross no trust boundary (they come from the browser's own layout, not from a user), so no new schema validation is required. No `any`. |
| **II. Shared Domain Model** | Pagination is not domain data and creates no entity. The one thing it must not do is fork how a section's content is decided, and it does not: it changes where pages break, never what a section contains. |
| **III. Test-First for Business Rules** | The packing rule decides what a client receives on paper, so it is treated as a business rule: the pure function is unit-tested first, and the printed result is verified against a real PDF rather than against the stylesheet. Testing the stylesheet is what let this recur. |
| **IV. Accessible, Data-Dense UI** | The preview's break markers are decorative and already `aria-hidden` in effect; they must stay non-essential, since a screen-reader user is not reading page boundaries. No interactive element changes. |
| **V. Workspace Isolation** | Untouched. Pagination reads nothing and writes nothing; the report's own access checks are unchanged. |
| **VI. Simplicity & Incremental Delivery** | A hand-rolled paginator was **rejected** in favour of the browser's own fragmentation (research R2). The pure function does not lay out pages — it only *predicts* where the browser will break, so the preview can say so. See Complexity Tracking for the one thing that is genuinely new. |

**Violations**: one, justified below.

## Project Structure

### Documentation (this feature)

```text
specs/009-report-pagination/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — 9 findings, each measured
├── data-model.md        # Phase 1 — the page constant, the packing rule
├── quickstart.md        # Phase 1 — 6 validation scenarios
├── contracts/
│   └── pagination.md    # What the document promises; the packing function
├── checklists/
│   └── requirements.md  # Spec quality — all passing
└── tasks.md             # Phase 2 — created by /speckit-tasks, not here
```

### Source Code (repository root)

```text
lib/domain/
└── report-pagination.ts          # NEW — PRINT_PAGE_HEIGHT_PX and paginate().
                                  #   Pure: measured heights in, breaks out.
                                  #   The packing rule lives here and nowhere else.

app/reports/[workspaceId]/
└── export-preview.tsx            # EDITED — the print stylesheet restated:
                                  #   sections flow, blocks stay whole, the
                                  #   cover and each process document break.
                                  #   Markers positioned from paginate().

app/(app)/workspaces/[workspaceId]/processes/[processId]/map/
└── static-process-map-diagram.tsx # EDITED — MAX_DIAGRAM_HEIGHT capped at the
                                   #   printable page height (research R3)

tests/
├── unit/
│   └── report-pagination.test.ts # NEW — the packing rule, and that it never
│                                 #   throws or loops on degenerate input
└── e2e/
    └── report-print.spec.ts      # EDITED — generates a real PDF and measures
                                  #   page usage, splits, the closing page, and
                                  #   preview-versus-PDF agreement
```

**Structure Decision**: no new structure. The rule goes in `lib/domain/` as a
pure module because it is a business rule (Principle III); the stylesheet stays
where it is; the diagram cap is a one-line change in the file that already owns
that constant. Everything is placed inside conventions the codebase already has.

## Phase 0 — Research

Complete. See [research.md](./research.md). Nine findings, every one measured
against the running report rather than read from the stylesheet — a distinction
that matters, because this problem has been "fixed" from the stylesheet before.

The three that shaped the plan:

- **R3 — the diagram cap.** `MAX_DIAGRAM_HEIGHT = 1500` against a 688 px page.
  A single number, and the root cause of the reported slicing. No break rule
  could have fixed it, which explains why previous attempts did not.
- **R2 — the granularity is wrong.** A process document is 2902 px, 4.2 pages.
  `break-inside: avoid` on it is ignored, so the browser breaks it anywhere.
  What must stay whole is the block.
- **R4 — the preview's marker comes from the class that forces the break.** The
  two agree today only by coincidence of the paging model. Flowing breaks that,
  which is why a prediction function is needed at all.

## Phase 1 — Design

Complete.

- [data-model.md](./data-model.md) — the 688 px page constant established first,
  the transient shapes, the packing rule written out, and what "a well-used
  page" means so a test and the spec cannot disagree.
- [contracts/pagination.md](./contracts/pagination.md) — what the printed
  document promises a reader, and the function the preview and the tests share.
- [quickstart.md](./quickstart.md) — six scenarios, with the baseline to beat
  recorded so improvement is measurable rather than asserted.

**Post-design Constitution re-check**: passing. The design added one pure module
and no dependency, table or abstraction beyond it.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| A function that predicts where the browser will break pages (`paginate()`), duplicating knowledge the browser already has | FR-013 and FR-014 require the preview to show exactly where the PDF breaks. CSS fragmentation decides that at paint time and exposes nothing to the DOM, so the preview cannot ask; it can only predict. Without it the preview either shows nothing (failing FR-014 and removing the check a consultant relies on) or shows markers that are wrong wherever pagination is actually interesting | Marking every 182 mm down the sheet ignores the jumps `break-inside: avoid` causes, so it would be wrong precisely where it matters; dropping the marker fails FR-014. The prediction is kept honest by an end-to-end test that compares it against a real PDF's page boundaries, so it cannot silently drift from the browser |

Note what is **not** being built: the function does not lay pages out. The
browser still paginates, exactly as it does today. This only reads the same
inputs and says what the browser is about to do.
