# Quickstart: validating the bandless printed map

## Prerequisites

```bash
pnpm install
SEED_DEMO_WORKSPACE=1 pnpm db:seed
nohup pnpm dev > /tmp/dev.log 2>&1 &   # never `pkill -f "next dev"` — it kills the shell
```

## 1. The layout function itself (fast, no browser)

```bash
pnpm test tests/unit/process-layout.test.ts
```

Extends the existing wrap tests with `bands: false` cases: a row's height is its
tallest card regardless of role count, every step in a row shares one y, and omitting
`bands` (or passing `true`) reproduces every existing assertion byte for byte — proving
the PPTX path is untouched by construction.

**Mutation check** — break these one at a time and confirm a test goes red:
- make `bands: false` still multiply height by role count
- make `bands: false` ignore the tallest card and use a fixed height
- make the default (`bands` omitted) behave like `false`

## 2. The drawn result

```bash
pnpm test:e2e tests/e2e/wrapped-process-map.spec.ts
pnpm test:e2e tests/e2e/connector-routing.spec.ts
```

Uses the six-role `wide-process` fixture built earlier this session — the shape that
exposed the defect — and the row-furniture regression test added alongside it. Extends
both with a bandless-specific check: no `lane` nodes on the report's wrapped map, and
the connector-routing suite's print test (`the printed map is routed by the same rules
as the screen`) re-run against the new geometry to prove SC-002.

## 3. Fewer pages, measured

```bash
pnpm test:e2e tests/e2e/report-print.spec.ts
```

The same measurement method as the connector-routing work: render the six-role
fixture's report to PDF, count pages, and assert the map's page count dropped versus a
recorded before-figure (see `research.md`'s baseline once measured).

## 4. The live canvas is untouched

```bash
pnpm test:e2e tests/e2e/wrapped-process-map.spec.ts -g "interactive Process Map is not wrapped"
```

Already exists; re-run to confirm nothing about it changed. No new test needed here —
`wrapProcessMap` is not in the interactive canvas's call graph at all, so there is
nothing new to assert that the existing test doesn't already cover by continuing to pass.

## 5. Read the PDF

```bash
pdftoppm -r 110 -png /tmp/report.pdf /tmp/page
```

Look for: a role still readable on every card, rows that read top-to-bottom without a
lane grid looking like an accident, and the page count actually shrinking against the
screenshot that started this feature.
