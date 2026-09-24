# Tasks: Parallel Step Numbering

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Tests are included. `computeStepNumberLabels` (research.md Decisions 1-3) is business
logic under Constitution Principle III — what the Steps List and printed report assert
about a step's position — so it's tested first, then implemented, mutation-checked.
Everything else is threading a computed string through existing, already-tested
rendering.

## Phase 1: Foundational — the numbering function (blocks every slice)

- [X] T001 Write `tests/unit/parallel-step-numbering.test.ts` against the contract in
      [data-model.md](./data-model.md): a plain process (no `joinRequiresAll`) labels
      every step `String(order)` unchanged; two direct predecessors of a
      `joinRequiresAll` step, contiguous and mutually unreachable, label as
      `{base}a`/`{base}b` and the step after them continues at `{base}+1`; three or
      more mutually-unreachable predecessors label `a`/`b`/`c`/…; a predecessor that has
      a path to another predecessor in the same set is excluded and keeps its own plain
      number, positioned correctly relative to the group; a candidate group that is not
      contiguous in Steps List order falls back to plain numbers for every member
      (research.md Decision 2); a `joinRequiresAll` step with only one predecessor labels
      that predecessor plainly; two independent `joinRequiresAll` steps each with their
      own parallel pair label independently, each from its own base. Confirm these fail
      before T002 exists.
- [X] T002 Implement `lib/domain/parallel-step-numbering.ts`: `computeStepNumberLabels`
      per data-model.md's internal shape — directed, cycle-safe reachability; per-join
      candidate-set exclusion (research.md Decision 3); contiguity check (Decision 2);
      single ordered walk assigning labels and advancing the base counter once per group,
      not once per member. Pure — no DOM, no Prisma, no network.
- [X] T003 Make T001 pass, then mutation-check: swap `a`/`b` assignment order, drop the
      pairwise-exclusion check (treat every predecessor as groupable), drop the
      contiguity check, and skip advancing the counter once per consumed group (advance
      once per member instead) — confirm each mutation is caught by the tests, then
      restore.

**Checkpoint**: the one piece of real logic this feature adds is correct and proven
without rendering anything.

## Phase 2: User Story 1 — a genuine parallel pair reads as lettered, everywhere a number already shows (Priority: P1) 🎯 MVP

**Goal**: Two mutually-unreachable direct predecessors of a `joinRequiresAll` step
display as `{base}a`/`{base}b` on the Steps List and on both printed layouts, and the
sequence continues correctly afterward.

**Independent Test**: Build a process with a genuine parallel pair feeding a
`joinRequiresAll` step; confirm both letter, in that order, on the Steps List and on
each printed layout, and the very next step reads the next whole number.

- [X] T004 [US1] Add `numberLabel: string` to `PrintStepInput` in
      `lib/domain/print-map-layout.ts`; add `numberLabel: string` to each
      `FlowRow.mergesFrom` / `RolesCell.mergesFrom` entry (alongside the existing
      `order`/`label`); add `toNumberLabel: string` and `fromNumberLabel: string` to
      `BackReference` (alongside the existing `toOrder`/`fromOrder`). Populate all three
      from `byId.get(...)!.numberLabel`, the same already-resolved lookup `order`/`label`
      already come from — no new pass over the data.
- [X] T005 [US1] Update `tests/unit/print-map-layout.test.ts`'s `step()` test helper to
      accept/default `numberLabel` (defaulting to `String(order)`, matching every
      existing test's implicit expectation), and extend the merge/back-reference
      assertions to also check the new `numberLabel`/`toNumberLabel` fields for the
      existing (unmarked) fixtures — still equal to the plain order, proving T004 doesn't
      change output when nothing uses parallel numbering.
- [X] T006 [US1] Wire `app/reports/[workspaceId]/printed-map/printed-process-map.tsx`:
      call `computeStepNumberLabels` (T002) once over `steps`/`connections`/the
      `joinRequiresAll` steps already available (spec 015), and set each
      `layoutSteps` entry's `numberLabel` from the result, alongside the existing
      `joinRequiresAll` field.
- [X] T007 [US1] Update `flow-layout.tsx` and `roles-layout.tsx`: the card-number
      `<span>` prints `row.step.numberLabel` / `cell.step.numberLabel` instead of
      `.order`; `mergeWording`'s unmarked branch (spec 015) prints
      `` `step ${m.numberLabel}` `` instead of `` `step ${m.order}` ``; back-reference
      text prints `back.toNumberLabel` instead of `back.toOrder`.
- [X] T008 [US1] Create `tests/fixtures/parallel-step-process.ts`: Start → Legal
      sign-off (Task) and Start → Client sign-off (Task), both → Countersign (Task, End
      after it), with Countersign's `joinRequiresAll` set true and its two predecessors
      genuinely unreachable from one another — the minimal shape every test in this
      feature needs.
- [X] T009 [US1] Wire `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/map-view.tsx`:
      call `computeStepNumberLabels` once over the page's already-loaded `steps`/
      `connections`, and pass each `StepListRow` its own `numberLabel: string`.
- [X] T010 [US1] Update `step-list-row.tsx`: accept a `numberLabel: string` prop and
      render it in the number chip instead of `index + 1`. `index` itself is unchanged —
      still drives `isFirst`/`isLast` for the move buttons (FR-010).
- [X] T011 [US1] Write `tests/e2e/parallel-step-numbering.spec.ts` covering User Story
      1's Acceptance Scenarios against the T008 fixture: the Steps List shows the two
      predecessors as `{base}a`/`{base}b`, in list order; the step after them shows the
      next whole number, not a skipped one; the printed report (both layouts) shows the
      same two labels on their own cards.

**Checkpoint**: the reported gap — two consecutive whole numbers falsely implying a
sequence — is closed and measured, everywhere a step number already appears. Shippable
on its own.

## Phase 3: User Story 2 — a real chain is never mislabeled as parallel (Priority: P1)

**Goal**: Two predecessors of the same `joinRequiresAll` step that *do* have a path
between them keep ordinary whole numbers; three or more predecessors with a mixed
reachability pattern group correctly.

**Independent Test**: Add a direct connection between the T008 fixture's two
predecessors (so one is reachable from the other) and confirm both revert to plain,
consecutive numbers.

- [X] T012 [US2] Extend `tests/fixtures/parallel-step-process.ts` (or add a sibling
      fixture) with a variant that connects the two otherwise-parallel predecessors
      directly to each other, and a second variant with three predecessors where one has
      a path to another (mixed reachability — spec Edge Cases).
- [X] T013 [US2] Extend `tests/e2e/parallel-step-numbering.spec.ts`: the connected-pair
      variant shows both predecessors with ordinary whole numbers, on the Steps List and
      both printed layouts; the three-predecessor mixed variant shows the two genuinely
      unreachable ones lettered and the connected one plain, positioned correctly
      relative to the pair (Edge Cases — "next to, not inside" the group).

**Checkpoint**: the numbering never produces a false "these are parallel" claim — the
trust bar this feature has to clear before it's usable at all.

## Phase 4: User Story 3 — zero change for any process that hasn't used this (Priority: P1)

**Goal**: Every process without a qualifying parallel group — no `joinRequiresAll` at
all, or a `joinRequiresAll` step with fewer than two qualifying predecessors — displays
identically to how it did before this feature shipped.

**Independent Test**: Run the existing spec 013/014/015 e2e suites (tender process,
decision branches, step join) unmodified and confirm every number they assert is
unchanged.

- [X] T014 [US3] Extend `tests/e2e/parallel-step-numbering.spec.ts`: a `joinRequiresAll`
      step with only one predecessor (spec 015's own edge case, reused) shows that
      predecessor with a plain number, not a lone letter.
- [X] T015 [US3] Run the full existing e2e suite — `printed-map.spec.ts` (specs 013/015),
      `decision-branch-editor.spec.ts` (spec 014), `step-join-requirement.spec.ts`
      (spec 015) — and confirm every one still passes unmodified, proving SC-002 by
      construction rather than by a new, separate assertion.

**Checkpoint**: all three user stories are independently functional, and the feature's
own non-negotiable backward-compatibility bar is verified against the very fixtures
spec 013-015 already built.

## Phase 5: Polish

- [ ] T016 Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`,
      `pnpm exec playwright test` and report counts. Do not edit while a run is in
      flight.
- [ ] T017 Blast-radius check: `process-map-canvas.tsx`, `step-form.tsx`, and every
      place that already names a step by label rather than number (spec 015's "needs
      both X and Y" wording, `governance-*`, unrelated report sections) must be unchanged
      by this feature — confirm via `git diff` against those paths.
- [ ] T018 Run [quickstart.md](./quickstart.md)'s manual validation end to end (all four
      scenarios) and record the result.

## Dependencies

- Phase 1 blocks every later phase: all of them render or assert against
  `computeStepNumberLabels`'s output.
- T008 (the fixture) blocks T011, T013, T014 — every e2e test in this feature is
  written against it or a variant of it.
- T004 blocks T006/T007 (the printed-map types must exist before either renderer or
  `printed-process-map.tsx` can be wired to them).
- Phases 2-4 are all P1 and together are the MVP — none is safely shippable alone,
  since User Story 1 without User Story 2's exclusion logic would already be capable of
  mislabeling a real chain as parallel the first time one occurs.

## Implementation Strategy

**MVP first**: Phase 1 → Phase 2 → Phase 3 → Phase 4, in order — Phase 2 alone is not
trustworthy without Phase 3's exclusion behavior proven, and Phase 4's full-suite run is
what actually proves SC-002 rather than merely asserting it. Phase 5 closes out with the
same verification rigor specs 014/015 used.
