---

description: "Task list for Wrapped Process Map"
---

# Tasks: Wrapped Process Map

**Input**: Design documents from `specs/007-wrapped-process-map/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/domain.md

**Tests**: Included. The arithmetic that decides what a client sees on a printed diagram is
exactly the kind of rule Principle III asks to be written test-first and proven to fail
before the implementation makes it pass.

**Organization**: Grouped by user story, with the pure function first because every story
consumes it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to

---

## Phase 1: Setup

- [X] T001 Write `scripts/make-long-process.ts`: creates `TES100 · End to end high-level` in the Acme workspace with 22 steps across three roles, one roleless step, and a decision that branches and rejoins — long enough to exercise every story at once — with a `--clean` flag to remove it

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure function every story and both renderers consume.

- [X] T002 Write failing unit tests in `tests/unit/process-layout.test.ts` for `wrapProcessMap` capacity and rows: capacity is `max(2, floor(boxWidth / STEP_X_SPACING))`; a step list at or under capacity returns `wrapped: false` with one row; a longer list deals into rows of exactly capacity with the remainder on the last; every step appears exactly once; ordering is by `positionX` then `positionY` then `id`
- [X] T003 Write failing unit tests for per-row lanes: a row carries only the lanes its own steps need; lane order within a row follows the whole-process order from `assignSwimlanes`; the Unassigned lane appears on rows with a roleless step and on no others; a row's height is `lanes.length * LANE_HEIGHT`
- [X] T004 Write failing unit tests for `crossRowMarkers`: a connection within one row produces none; a connection across rows produces one marker at each end naming the other row (1-based); a decision with two outgoing connections landing on different rows produces markers for both; a step reached twice is never duplicated
- [X] T005 Write failing unit tests for the totality promise: an empty step list, a single step, a `boxWidth` of 0 and a negative `boxWidth` all return a usable layout and none of them throws
- [X] T006 Implement `wrapProcessMap` and `crossRowMarkers` in `lib/domain/process-layout.ts` per `contracts/domain.md` until T002–T005 pass
- [X] T007 Prove the tests bite: mutate capacity (drop the floor of two), the row arithmetic (use all lanes per row rather than the row's own), the ordering (array order rather than position), and the marker rule (mark same-row connections too). Confirm each mutation fails the suite, then revert

**Checkpoint**: the arithmetic is settled and provably tested without rendering anything.

---

## Phase 3: User Story 1 & 2 — A long process stays readable, in lanes (Priority: P1) 🎯 MVP

**Goal**: The report's process map wraps a long process onto several rows, each row carrying
its own labelled lanes, with every step at full size.

**Independent test**: Export `TES100`, confirm the map runs onto more than one row at full
step size with all 22 steps present, each in its role's lane on its own row.

### Tests

- [X] T008 [P] [US1] Write failing e2e `tests/e2e/wrapped-process-map.spec.ts`: export a pack containing the long process, assert its map renders more than one row of steps, that all 22 steps are present, and that the rendered step size matches an unwrapped process's rather than being shrunk
- [X] T009 [P] [US1] Extend the same spec with the regression that matters: a short process (seeded `PUR101`, 9 steps) does **not** wrap and renders as it did before — FR-003 and SC-005
- [X] T010 [P] [US2] Extend the spec: on a wrapped map every row shows labelled lanes, a step on the second row sits in its own role's lane, and a row whose steps are all one role shows one lane rather than three

### Implementation

- [X] T011 [US1] Have `static-process-map-diagram.tsx` call `wrapProcessMap` with the box width it is rendering into, and build its nodes from the returned rows instead of from stored positions — taking the existing path unchanged when `wrapped` is false
- [X] T012 [US2] Build one set of lane nodes per row, from that row's own lanes, so lane labels repeat down the page and no row reserves space for a lane it does not use
- [X] T013 [US1] Grow the diagram box with the number of rows instead of clamping it at 320–640px, up to a cap, and fall back to today's single shrunk row past the cap (FR-017). **The riskiest task in the feature**: getting the cap wrong shrinks maps that should have wrapped, which looks exactly like the bug being fixed

**Checkpoint**: a long process is readable in the report; a short one is untouched.

---

## Phase 4: User Story 3 — Branches and decisions survive (Priority: P2)

**Goal**: Connections are all drawn, and one crossing rows is followable.

**Independent test**: Export a process with a decision branching and rejoining across a row
boundary; both paths are drawn and the crossing is marked at both ends.

### Tests

- [X] T014 [P] [US3] Extend the e2e spec: a decision's two outgoing connections are both drawn; a connection whose steps land on different rows shows a "continues on row N" marker at one end and "from row N" at the other; no edge is drawn straight across the page
- [X] T015 [P] [US3] Extend the e2e spec: a step reached by more than one path appears exactly once

### Implementation

- [X] T016 [US3] Draw same-row connections as edges exactly as now, and render `crossRowMarkers` as text at the two ends instead of an edge, at the project's contrast bar — `text-slate-400` fails on white and has caused three regressions in this codebase
- [X] T017 [US3] Keep a cross-row connection's label attached to its marker rather than dropping it (FR-012)

---

## Phase 5: User Story 4 — The interactive map is untouched (Priority: P1)

**Goal**: A consultant's hand-arranged positions and the interactive map are unaffected.

**Independent test**: Record positions, export the report, confirm positions unchanged and
the interactive map unwrapped.

- [X] T018 [P] [US4] Write failing e2e: record every step's stored position, export the report containing that process, and assert no position changed
- [X] T019 [P] [US4] Extend it: the interactive Process Map for the long process renders unwrapped and still pans and zooms
- [X] T020 [US4] Confirm by inspection that `wrapProcessMap` is called only from the static diagram and the deck, and that nothing in the call path writes a position

---

## Phase 6: The deck

- [X] T021 Have the deck's process-map slide in `lib/export/pptx/report-pptx.ts` use `wrapProcessMap` with the slide's own width, so a long process is legible on a slide by the same standard as in the report (FR-018)
- [X] T022 [P] Extend `tests/e2e/report-composer.spec.ts`'s deck reader: a long process's deck contains every step's label

---

## Phase 7: Polish & Cross-Cutting

- [X] T023 [P] Run `pnpm test` and the full Playwright suite; confirm `report-print.spec.ts`, `core-workflows.spec.ts` and `report-composer.spec.ts` all still pass — they cover the page-break and section behaviour this change is most likely to disturb
- [X] T024 [P] Check contrast on the cross-row markers against WCAG 2.1 AA, and re-run the report page's axe check
- [ ] T025 Export a long process to PDF and read it: every step legible at 100%, the reading order clear without being explained, and every lane labelled on every row. This is SC-001 and SC-003, and neither can be asserted by a test
- [ ] T026 Walk `specs/007-wrapped-process-map/quickstart.md` end to end and correct it wherever the built behaviour differs

---

## Dependencies

```text
Phase 1 (T001) ──► Phase 2 (T002–T007) ──► Phase 3 (US1+US2, T008–T013)
                                                   │
                        ┌──────────────────────────┼──────────────────────┐
                        ▼                          ▼                      ▼
              Phase 4 (US3, T014–T017)   Phase 5 (US4, T018–T020)   Phase 6 (T021–T022)
                        └──────────────────────────┼──────────────────────┘
                                                   ▼
                                          Phase 7 (T023–T026)
```

- **T001 comes first** because every later test needs a process long enough to wrap, and
  the seeded ones are all short.
- **T006 blocks everything** — both renderers and all four stories consume it.
- **US1 and US2 are one phase.** A wrapped map without per-row lanes is not a swimlane
  diagram, so shipping one without the other would be shipping something wrong.
- **Phases 4, 5 and 6 are independent** of each other once Phase 3 lands.

## Parallel opportunities

- T002–T005 are four describe-blocks in one file and can be written together.
- T008, T009 and T010 extend one new spec file in one pass.
- T014, T015, T018 and T019 are separate scenarios and can be drafted together.
- T023 and T024 are independent checks over finished work.

## Implementation strategy

**MVP is Phases 1–3.** A long process becomes readable in the report, in lanes, and a short
one is untouched. That is the request as the user made it and is shippable alone.

**Phase 5 is not optional despite being last-but-two.** It asserts the thing whose failure
would be most expensive — a consultant's arrangement silently rewritten — and it is cheap,
because the implementation makes it true by construction and the test only has to prove it.

**Phase 6 can lag.** A deck whose long map is shrunk is worse than one that wraps, but the
report is what a client is usually sent.
