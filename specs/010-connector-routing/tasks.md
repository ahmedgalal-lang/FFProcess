# Tasks: Connector Routing on the Process Map

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contract**: [contracts/connector-routing.md](./contracts/connector-routing.md)

Tests are included deliberately: every guarantee in `data-model.md` is a geometric
invariant that cannot be eyeballed, and the user has been shown three previous fixes to
this map that looked right and were not.

## Phase 1: Setup

- [x] T001 Record the baseline the fix has to beat: render the demo workspace's largest process map and count, from the rendered page, connectors crossing a non-endpoint card and pairs sharing a line. Write the two numbers into `specs/010-connector-routing/research.md` under a new "Measured baseline" heading. Without this the success criteria are unfalsifiable.

## Phase 2: Foundational (blocks every user story)

- [x] T002 Create `lib/domain/connector-routing.ts` with the types from `contracts/connector-routing.md` (`RouteSide`, `RoutedStep`, `RoutedConnection`, `ConnectorRoute`) and a `routeConnectors` stub that returns an empty map.
- [x] T003 Write `tests/unit/connector-routing.test.ts` covering the six guarantees in `data-model.md` against the stub, and confirm every one fails. A test that passes against an empty map is testing nothing.
- [x] T004 Implement row clustering and band construction in `lib/domain/connector-routing.ts`: group steps by drawn centre-y within a tolerance, sort rows, and build the band between each adjacent pair from the deepest card bottom above and the tallest card top below, plus the two outer bands.
- [x] T005 Implement gutter measurement in `lib/domain/connector-routing.ts`: for a card and a side, the space to the nearest card in the same row on that side, with a default where there is none.
- [x] T006 Implement the direct/routed decision in `lib/domain/connector-routing.ts` per research Decision 4 — direct when same row and the straight segment between the facing edges passes no other card.
- [x] T007 Implement corridor assignment in `lib/domain/connector-routing.ts`: group routed connectors by band, then distribute evenly across the band's usable height per research Decision 6, capped at a comfortable default spacing.
- [x] T008 Implement exit and approach distances in `lib/domain/connector-routing.ts`: per card and side, distribute the connectors leaving (or arriving) across that gutter so each gets its own vertical, clamped inside the gutter.
- [x] T009 Make every test from T003 pass, then mutation-check each one: break the invariant it names and confirm it goes red. Record in the test file which mutation each test catches.

**Checkpoint**: the router is correct and proven in isolation. Nothing is drawn yet.

## Phase 3: User Story 1 + 2 — arrows are traceable and cross no card (P1)

Both stories share one implementation: the live canvas drawing routed connectors. They
are delivered together because separating them would mean drawing a route that avoids
overlap but not cards, which is not a state worth shipping.

- [x] T010 [US1] Write `tests/e2e/connector-routing.spec.ts`: open the demo workspace's largest process map, read every connector's rendered SVG path and every card's rendered box out of the page, and assert zero non-endpoint card crossings (SC-001) and zero shared-line pairs (SC-002). Run it against the unchanged canvas and confirm it fails at the T001 baseline.
- [x] T011 [US1] Create `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/routed-edge.tsx`: a ReactFlow edge component that reads its `ConnectorRoute` from `data`, builds the orthogonal path, and renders it through `<BaseEdge>` so the label, the interaction path, selection and deletion all keep working.
- [x] T012 [US1] In `process-map-canvas.tsx`, replace `chooseHandles` with a `useMemo` that builds `RoutedStep`s from live node positions and `NODE_HALF_SIZE`, calls `routeConnectors`, and attaches each route to its edge's `data`; register `routed` in `edgeTypes` and switch step-to-step edges to it. Keep the amber dashed loop styling, the arrowhead, the label styles and the `ariaLabel`.
- [x] T013 [US1] Make `tests/e2e/connector-routing.spec.ts` pass, and re-measure the two numbers against the T001 baseline.
- [x] T014 [US2] Extend `tests/e2e/connector-routing.spec.ts` to check loops specifically: a backward connector keeps its distinct dashed amber appearance and crosses no card.
- [x] T015 [US1] Check the live canvas against the accessibility bar it already meets: a connector is still reachable and selectable by keyboard, still deletable with Delete, and still announces both endpoints. Run the existing axe pass for the map page.

**Checkpoint**: the reported defect is fixed on screen and measured, not asserted.

## Phase 4: User Story 3 — the printed report matches (P2)

- [x] T016 [US3] In `static-process-map-diagram.tsx`, replace `chooseHandlesAt` with the same router, building `RoutedStep`s from the serpentine wrap's placed positions and `PRINT_NODE_HALF_SIZE`. Leave continuation stubs, the seam connector and branch-entry edges exactly as they are (research Decision 7).
- [x] T017 [US3] Add to `tests/e2e/report-diagram.spec.ts` a check that a connector's route shape in the static diagram matches the live canvas for the same process (SC-005).
- [x] T018 [US3] Re-run `tests/e2e/report-print.spec.ts` and confirm the row-group pagination is unaffected: routing changes what is inside a row-group box, not how tall it is. If a box's measured height moved, fix the cause rather than re-recording the expectation.
- [x] T019 [US3] Export the demo workspace's report to PDF, rasterise it, and read the process pages. Look for an arrow entering a card it should not, an arrow outside the map bounds, and a label on the wrong line. This is the check the automated ones cannot make.

## Phase 5: User Story 4 — routing keeps up with edits (P3)

- [x] T020 [US4] Extend `tests/e2e/connector-routing.spec.ts`: drag a step into another lane, re-read every path, and assert the connectors touching it moved with it and still cross no card (FR-010, SC-006).
- [x] T021 [US4] Extend the same spec: draw a new connector between two steps that already have connectors between their lanes, and assert it takes its own line rather than landing on an existing one.

## Phase 6: Polish

- [x] T022 Delete the now-unused `chooseHandles` and `chooseHandlesAt` and any handle ids in `map-nodes.tsx` that nothing references any more. Leaving two dead copies of the thing that caused this bug would be the wrong ending.
- [x] T023 Run the full suites — `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm exec tsc --noEmit` — and report the counts. Do not edit any file while a run is in flight.
- [x] T024 Re-read `spec.md`'s success criteria one by one against what was actually measured, and record each one's result in `specs/010-connector-routing/checklists/requirements.md`. Any criterion that was not measured is not met.

## What changed along the way

Four things in the plan turned out to be wrong, and are recorded here rather than
quietly rewritten:

- **T005's "gutter" was per-row.** A connector descending from the first row to the
  fourth passes through the rows between, and a strip clear in the target's own row says
  nothing about those. Corrected to a strip clear of every card on the map.
- **The strip search walked past cards.** Told there was no room immediately beside a
  card, it looked further out, found a clear strip on the far side of the next card
  along, and drew the stub straight through it. The print map — where a compact decision
  is wide enough to sit under both of its neighbours — is where this showed. A card with
  anything across its edge is now left through its top or bottom instead, which needed a
  route shape the plan did not have.
- **Two views of one gap were allocated separately.** The space between two cards was
  found as "the strip right of this one" and "the strip left of that one", with different
  invented bounds, so the same gap got two independent allocations and two connectors
  picked the same line in it. Now both sides describe the gap the same way.
- **Direction was taken from the route.** Inferring "this is a loop" from which side a
  connector leaves is wrong on a serpentine map, where a whole row runs right to left and
  none of it is a loop. Each renderer decides, and the router stays geometry.

## Dependencies

- T001 before T010 (a baseline recorded after the fix is not a baseline).
- Phase 2 (T002–T009) blocks everything: both renderers consume the router.
- T003 must fail before T004–T008 start; T009 closes the loop.
- US1+US2 (Phase 3) before US3 (Phase 4): the print diagram copies the canvas's call.
- US4 (Phase 5) after Phase 3 — it tests the canvas's re-routing.
- T022 last among the code changes: both call sites must be off the old helpers first.

## Parallel opportunities

- T004 and T005 touch different functions in the same new file and are independent in
  logic but not in file, so they are not marked [P].
- T017 and T020 are in different spec files and can be written in parallel once Phase 3
  lands.
- T019 (reading the PDF) can run while T020/T021 are being written.

## MVP scope

Phases 1–3: the router plus the live canvas. That alone fixes the defect the user
reported and photographed, and is independently demonstrable — open the map, the arrows
are traceable. Phase 4 makes the deliverable match, and is what closes the feature.
