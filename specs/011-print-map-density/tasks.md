# Tasks: Printed Process Map Without Lane Bands

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contract**: [contracts/wrap-process-map.md](./contracts/wrap-process-map.md)

Tests are included deliberately: FR-006 ("the live canvas is untouched") and the PPTX
export's silence in the spec are both claims about code paths *not* changing, which is
exactly the kind of thing worth proving rather than asserting.

## Phase 1: Setup

- [x] T001 Record the baseline the fix has to beat: render the six-role `wide-process` fixture's report to PDF and count the pages the map occupies today. Write the number into `specs/011-print-map-density/research.md` under a new "Measured baseline" heading. Without this SC-001 is unfalsifiable.

## Phase 2: Foundational (blocks every user story)

- [x] T002 Add the `bands?: boolean` option to `wrapProcessMap`'s options type in `lib/domain/process-layout.ts`, per `contracts/wrap-process-map.md`. Default `true`.
- [x] T003 [P] Extend `tests/unit/process-layout.test.ts` with `bands: false` cases (row height is the tallest card, every step in a row shares one y, a role mix doesn't change height) and confirm they fail against the stub.
- [x] T004 [P] Extend the same file with "omitting `bands` reproduces every existing assertion" — re-run the existing wrap test bodies with `bands: true` explicit and confirm identical output to the no-option case, so the PPTX caller's safety is proven, not assumed.
- [x] T005 Implement the `bands: false` branch in `wrapProcessMap`: row height becomes the tallest card in the row plus `WRAPPED_ROW_GAP` headroom (research.md Decision 2), every `PlacedStep.y` becomes the row's own centre, `laneIndex` becomes `0`. `lanes` is still computed and returned in both modes (Decision 3).
- [x] T006 Make T003/T004 pass, then mutation-check: break the row-height formula and the y-centring one at a time and confirm the matching test goes red.

**Checkpoint**: the layout function is correct and proven in isolation. Nothing renders differently yet.

## Phase 3: User Story 1 — the printed map fits far fewer pages (P1)

- [x] T007 [US1] In `static-process-map-diagram.tsx`, pass `bands: false` to the `wrapProcessMap` call that builds the report's layout.
- [x] T008 [US1] In the same file, condition the lane-node build (the one call site that reads `row.lanes`, confirmed by grep in research.md) on `bands` — when dropped, no `lane` nodes are built for that row.
- [x] T009 [US1] Extend `tests/e2e/wrapped-process-map.spec.ts` with a case against the six-role fixture: the report's wrapped map has zero `.react-flow__node-lane` nodes, and every step card is still present with its role name printed on it (FR-002).
- [x] T010 [US1] Extend `tests/e2e/report-print.spec.ts`: render the six-role fixture's report to PDF and assert the map's page count is lower than the T001 baseline (SC-001).

**Checkpoint**: the reported defect is fixed and measured, not asserted.

## Phase 4: User Story 2 — still readable, connectors still clean (P1)

- [x] T011 [US2] Extend `tests/e2e/wrapped-process-map.spec.ts`'s existing furniture assertions (row label, backward notice, rule, seam, continuation markers) to also run against the six-role, bands-dropped fixture — confirming FR-003 holds under the new geometry, not only the three-role banded one it already covers.
- [x] T012 [US2] Re-run `tests/e2e/connector-routing.spec.ts`'s printed-map test ("the printed map is routed by the same rules as the screen") against the six-role fixture specifically, and confirm zero card crossings under bandless rows (FR-004, SC-002). No router code change expected — this is a proof obligation, per plan.md.
- [x] T013 [US2] Read the rendered PDF by hand for the six-role fixture: confirm a row mixing a decision and a task looks intentional (both centred on the row, not offset baselines) and that nothing about a bandless row's height depends on how many roles it touches.

## Phase 5: User Story 3 — the live canvas is provably untouched (P1)

- [x] T014 [US3] Re-run the existing "the interactive Process Map is not wrapped" test in `tests/e2e/wrapped-process-map.spec.ts` unmodified, and confirm it still passes — `wrapProcessMap` is not in the interactive canvas's call graph, so this is the existing proof, not a new one.
- [x] T015 [US3] Grep the diff for this feature against `process-map-canvas.tsx` and `map-nodes.tsx`'s non-compact node components; confirm zero lines touched, and record that confirmation in `specs/011-print-map-density/checklists/requirements.md` against SC-004.

## Phase 6: Polish

- [x] T016 Confirm `lib/export/pptx/report-pptx.ts`'s call to `wrapProcessMap` is unmodified and still passes no `bands` option, so the slide deck is byte-for-byte unaffected (the control case for Decision 1's safety argument).
- [x] T017 Run the full suites — `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm exec tsc --noEmit` — and report the counts. Do not edit any file while a run is in flight.
- [x] T018 Re-read `spec.md`'s success criteria one by one against what was actually measured, and record each one's result in `specs/011-print-map-density/checklists/requirements.md`. Any criterion not measured is not met.

## Dependencies

- T001 before T010 (a baseline recorded after the fix is not a baseline).
- Phase 2 (T002–T006) blocks everything: the render branch (Phase 3) consumes the option.
- T003/T004 must fail before T005 starts; T006 closes the loop.
- Phase 3 (US1) before Phase 4 (US2): US2 reruns furniture/routing checks against the
  geometry US1's render branch produces.
- Phase 5 (US3) has no dependency on Phases 3–4 — it is proving something this feature
  never touches — but is sequenced last among the story phases since it is a
  confirmation, not a build step.
- T016 depends on nothing changing — it is a negative check, safe to run any time after
  T002, done last for tidiness.

## Parallel opportunities

- T003 and T004 are independent assertions in the same file and may be written in
  parallel, marked [P].
- T009 and T010 are in different spec files and may be written in parallel once Phase 3's
  render change (T007–T008) lands.
- T013 (reading the PDF) can run while T014/T015 (the negative checks) are being done.

## MVP scope

Phases 1–3: the layout option plus the report's render branch. That alone fixes the
defect and is independently demonstrable — export the six-role process, count the
pages. Phase 4 proves the fix didn't break readability or routing; Phase 5 proves the
one thing the user explicitly protected (the live canvas) was never at risk.


## What changed along the way

Three things the plan did not anticipate, recorded rather than quietly rewritten:

- **The column spacing had to widen too.** With lane bands, neighbouring steps were
  usually at different heights, so a decision card (176px wide) overlapping a 150px
  column went unnoticed for as long as the feature has existed. Collapse the lanes and
  every step in a row is on one line, where that overlap means there is no clear strip
  beside the card at all — the connector router then leaves through the card's bottom
  and travels around, turning a straight run of six steps into a row of detours. This is
  almost certainly what the user meant by the drawing "sometimes working and other times
  not": it depended entirely on whether a decision happened to sit next to another card.
  `wrapProcessMap` now widens a bandless row's column to clear the widest card the
  process actually holds. It costs a step a row on a process containing a decision,
  which is cheap against the pages a bandless map saves.
- **A fixture had silently stopped testing what it was for.** Widening the column
  dropped the row capacity from six to five, which moved the long-process fixture's
  labelled branch from "two rows ahead" to "the next row, same column" — which the
  serpentine layout draws as a plain vertical drop rather than a marked cross-row pair.
  Three tests failed, and the honest reading is not that they were wrong but that the
  fixture had stopped exercising cross-row markers at all. The branch now skips three
  rows, which can never be a seam at any capacity.
- **Two existing tests asserted the behaviour this feature removes.** "Every row carries
  its own labelled lanes" and the lane-band tail of the report-diagram test were both
  testing lane bands on a wrapped printed map. Replaced with the invariant that actually
  matters now and was the whole basis for judging the trade safe: a step's role is still
  legible on its own card.
