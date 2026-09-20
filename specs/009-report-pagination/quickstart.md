# Quickstart: Validating the Report's Pagination

**Feature**: `specs/009-report-pagination`

How to prove this is fixed — and, more to the point, how to prove it stays
fixed, since it has come back before.

## Prerequisites

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

No migration. This feature adds no tables and changes no data.

---

## Scenario 1 — The paper is no longer half blank (SC-001, SC-002, SC-003)

The measurement that defines the problem. It renders a real PDF and measures
how much of each sheet carries ink.

```bash
pnpm exec playwright test tests/e2e/report-print.spec.ts -g "fills its pages"
```

Baseline to beat, measured before any change: **13 pages, mean usage 47%**, six
pages under a third used, one at 6%.

Target: **mean ≥ 70%**, **no page below 40%**, and fewer pages than before —
excluding the cover and the first page of each process document, which are
reserved deliberately.

By hand: export the report, then look at it. Half-empty pages are obvious
without a tool, which is how this was reported in the first place.

---

## Scenario 2 — Nothing is sliced (SC-004)

```bash
pnpm exec playwright test tests/e2e/report-print.spec.ts -g "never splits"
```

Asserts no page boundary falls inside a step card, a table row, a list item or
a diagram, by comparing every such element's box against the page boundaries.

The case that matters is the process map: it used to be allowed 1500 px against
a 688 px page, so it could not avoid fragmenting. Confirm a long process map
prints complete on one page.

---

## Scenario 3 — The closing page is not stranded (SC-005)

```bash
pnpm exec playwright test tests/e2e/report-print.spec.ts -g "closing"
```

The closing message shares the last page of content when there is room, and
takes its own page only when there is not.

---

## Scenario 4 — The preview still tells the truth (SC-006)

The one that keeps the rest honest.

```bash
pnpm exec playwright test tests/e2e/report-print.spec.ts -g "preview agrees"
```

Generates a PDF, reads its real page boundaries, and compares them against the
markers the preview drew. Every break in one must appear in the other.

**If this fails, nothing else in this list can be trusted** — the preview is how
a consultant checks a report before sending it, and a preview that disagrees
with the PDF is worse than none because it is believed.

---

## Scenario 5 — The rule holds for any report (SC-008)

```bash
pnpm vitest run tests/unit/report-pagination.test.ts
```

The packing function, against sequences a real report cannot easily produce:
blocks of zero height, one block taller than several pages, a document of one
block, a document of none, and randomised section orders.

Two invariants matter most:

- It never throws and never loops. A capacity or height of zero must be clamped
  — the wrapped process map hit exactly this hazard and it hung the test runner
  rather than failing it.
- `oversized` is empty for a real report. Anything in it is something no break
  rule can keep whole, and the fix belongs upstream.

---

## Scenario 6 — Nothing was lost (FR-017)

```bash
pnpm exec playwright test tests/e2e/report-print.spec.ts -g "loses nothing"
```

Every process, heading and table row present before the change is present
after, once, in the same order. Pagination that drops a section would satisfy
every usage target perfectly.

---

## Full suite

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm vitest run
pnpm exec playwright test
```
