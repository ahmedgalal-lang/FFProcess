---

description: "Task list for Report Composer"
---

# Tasks: Report Composer

**Input**: Design documents from `specs/006-report-composer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md

**Tests**: Included. Principle III requires business-rule logic to have tests that fail
before the implementation makes them pass. The rules here are the merge, the numbering and
emptiness — plus one regression test that is the safety net for the riskiest task in the
feature.

**Organization**: Grouped by user story. The domain module comes first because all four
stories consume it, and the renderer comes before the controls because controls nothing
honours are not a shippable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to

---

## Phase 1: Setup

- [X] T001 Add `reportArrangement Json?` to `model Workspace` in `prisma/schema.prisma`, with a comment saying null means "never arranged" and why that matters
- [X] T002 Generate the migration with `prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --script` into `prisma/migrations/<ts>_report_arrangement/migration.sql`, confirm it is one `ALTER TABLE ... ADD COLUMN` with no backfill, and apply it

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The domain module every renderer and control consumes. Nothing else can start.

- [X] T003 Write the catalogue in `lib/domain/report-arrangement.ts`: six pack sections, four process sections, eleven blocks with their default sections, `locked` on the cover page and `pinnedTo: "raciGrid"` on the authority rules, in the order the report prints today — per `specs/006-report-composer/data-model.md`
- [X] T004 Write failing unit tests in `tests/unit/report-arrangement.test.ts` for `resolveArrangement`: null/undefined/malformed/unknown-version all give the default; stored order is honoured; ids the catalogue no longer knows are dropped; catalogue entries the stored value does not mention are appended **included**; separated pinned blocks are pulled back together. Confirm they fail against a stub
- [X] T005 Write failing unit tests for numbering: included sections are `N.0` in position order; blocks are `N.M`; excluding a section closes the gap so no printed number ever skips; excluded entries have no number; a block moved into another section takes that section's prefix
- [X] T006 Write failing unit tests for emptiness: a section is empty when every **included** block is empty; an excluded block does not make its section empty; a section with no included blocks is empty
- [X] T007 Implement `resolveArrangement`, the numbering and the emptiness predicates in `lib/domain/report-arrangement.ts` until T004–T006 pass. `resolveArrangement` must be total — no input may throw, because every caller is on a render path
- [X] T008 Verify the tests bite: mutate the merge (drop the "append unmentioned entries" step), the numbering (position among all rather than included entries) and the pin repair, and confirm each mutation fails the suite. Revert

**Checkpoint**: the rules are settled and provably tested without a database.

---

## Phase 3: User Story 1 — Leave out what the client did not ask for (Priority: P1) 🎯 MVP

**Goal**: An editor can exclude sections and blocks, and the exported pack contains exactly
what was left ticked, renumbered without gaps.

**Independent test**: Untick two sections, export, confirm neither appears and the rest are
numbered without gaps.

### Tests for User Story 1

- [X] T009 [US1] **Write the SC-007 regression test first**, before any renderer change: capture the rendered report for the seeded workspace with no arrangement stored, and assert the restructured renderer produces the same content. This is the safety net for T011 and must exist before it
- [X] T010 [P] [US1] Write failing e2e `tests/e2e/report-composer.spec.ts`: untick Executive Summary, preview, assert no process has one and Process Map is now `1.0`; untick a block, assert it is absent and its siblings renumber

### Implementation for User Story 1

- [X] T011 [US1] Restructure `app/reports/[workspaceId]/export-preview.tsx`: split `ProcessReportSection` so each of the eleven blocks is its own component in one lookup keyed by block id, and each of the six pack sections likewise. Replace every `hasX &&` guard with the catalogue's emptiness predicate. **Behaviour must not change yet** — T009 is the proof
- [X] T012 [US1] Load the workspace's `reportArrangement` in `app/reports/[workspaceId]/page.tsx`, resolve it, and have the renderer walk the resolved order instead of the fixed sequence
- [X] T013 [US1] Render section and block headings from the resolved numbering rather than the hard-coded `1.0`/`2.0`/`3.0`/`3.1` strings
- [X] T014 [US1] Handle the nothing-included case (FR-025): a pack with no sections ticked renders a document stating it is empty, not a blank page or an error

**Checkpoint**: the report honours an arrangement, and an un-arranged workspace is unchanged.

---

## Phase 4: User Story 3 — The arrangement is this client's (Priority: P2)

**Goal**: An arrangement is saved against one workspace, survives, and is visible to every
editor of that workspace and to no other workspace.

**Independent test**: Arrange A, confirm B unchanged, return to A, then open A as another
editor.

### Tests for User Story 3

- [X] T015 [P] [US3] Extend `tests/e2e/report-composer.spec.ts`: arrange one workspace, assert a second workspace still shows the default, return and assert the arrangement survived, and assert a second editor sees it
- [X] T016 [P] [US3] Extend `tests/e2e/viewer-read-only.spec.ts`: a viewer sees no tick and no arrow on the Export Report page, **and** can still use Preview report and the deck download — the second half is the assertion that matters

### Implementation for User Story 3

- [X] T017 [US3] Write `saveReportArrangement` in `lib/actions/report-arrangement.ts` per `contracts/server-actions.md`: Zod-validated input, `EDITOR` access, reject ids the catalogue does not know and `sec` values that are not process sections, force `on: true` on locked sections, store with `version: 1`, revalidate the export page and the report
- [X] T018 [US3] Load and resolve the arrangement in `app/(app)/workspaces/[workspaceId]/export/page.tsx` and pass it to the picker

**Checkpoint**: arrangements persist per client and cannot leak between them.

---

## Phase 5: User Story 2 — Put the important part first (Priority: P2)

**Goal**: An editor can reorder sections and blocks, everything renumbers, and the RACI
grid and authority rules move as one.

**Independent test**: Move a section to the top, export, confirm both order and numbering
followed.

### Tests for User Story 2

- [X] T019 [P] [US2] Extend the e2e spec: move RACI above Process Map, assert on-screen numbering becomes `1.0`/`1.1`/`1.2`, preview and assert the document matches
- [X] T020 [P] [US2] Extend the e2e spec: press ↓ on RACI grid and assert the authority rules moved with it and remain adjacent; assert the authority rules row offers no arrows and says why

### Implementation for User Story 2

- [X] T021 [US2] Add the two arranging panels to `app/(app)/workspaces/[workspaceId]/export/export-picker-form.tsx`: pack sections, and process sections with their blocks indented, each row a tick plus ↑/↓, rendering nothing when `useCanEdit()` is false
- [X] T022 [US2] Implement moving: a section carries its blocks; a block steps past a section boundary and adopts that section; a pinned pair moves as one unit and the junior member shows why it has no arrows
- [X] T023 [US2] Show the live resolved numbering on each row, and save through `saveReportArrangement` on every change, reading rows straight from props rather than seeding them into state — `useState` takes only its initial value, which froze the authority matrix once already
- [X] T024 [US2] Give the panels a visible focus ring and `aria-label`s on every arrow, and add an axe check for the extended Export Report page to `tests/e2e/accessibility.spec.ts`

**Checkpoint**: the page is the mockup, wired to real data.

---

## Phase 6: User Story 4 — See what is still to be captured (Priority: P3)

**Goal**: An included section or block with nothing recorded still prints, marked, keeping
its number.

**Independent test**: Export a process with no KPIs and the KPI block ticked; it appears,
numbered, marked empty. Untick it; it is gone.

### Tests for User Story 4

- [X] T025 [P] [US4] Extend the e2e spec: with the KPI block ticked and a process that has no KPIs, assert the block appears with its number and an empty marker; untick it and assert it is absent and the numbers close up

### Implementation for User Story 4

- [X] T026 [US4] Render the "no data yet" marker for an included but empty section or block in `export-preview.tsx`, at the project's contrast bar — `text-slate-400` fails on white and has caused two regressions here already
- [X] T027 [US4] Rewrite the preview-only banner that currently says *"Some sections are missing content and are left out of this report"*. After this feature they are not left out, so the sentence is false: it becomes a list of what is empty and still printed, pointing at where to fill it in
- [X] T028 [US4] Show on the Export Report page which ticked sections will come out empty, so a consultant does not have to export to find out (FR-023, SC-005)

---

## Phase 7: The deck

- [X] T029 Make `lib/export/pptx/report-pptx.ts` walk the resolved arrangement instead of its fixed sequence: excluded sections produce no slides, and section order follows the arrangement
- [X] T030 Skip empty sections in the deck rather than printing an empty marker — a slide saying "no data yet" is noise in a summary. Record the difference from the report in a comment, since it is deliberate
- [X] T031 [P] Extend `tests/e2e/export.spec.ts`: download the deck with a section excluded and assert its content is absent, and that section order follows the arrangement

---

## Phase 8: Polish & Cross-Cutting

- [X] T032 [P] Run `pnpm test` and the full Playwright suite; confirm `report-order.spec.ts`, `export.spec.ts` and `report-print.spec.ts` all still pass — they cover the behaviour this feature must not disturb
- [X] T033 [P] Confirm the per-process RACI and Authority spreadsheet downloads are unaffected by any arrangement (FR-022)
- [X] T034 [P] Check contrast on every new control and marker against WCAG 2.1 AA
- [X] T035 Walk `specs/006-report-composer/quickstart.md` by hand end to end, including step 17 — comparing an un-arranged workspace's report against what it produced before — and correct the quickstart wherever the built behaviour differs

---

## Dependencies

```text
Phase 1 (T001–T002)
   └─► Phase 2 (T003–T008)  ── the domain module; blocks everything
          └─► Phase 3 (US1, T009–T014)   the report honours an arrangement
                 └─► Phase 4 (US3, T015–T018)   arrangements save per client
                        └─► Phase 5 (US2, T019–T024)   reordering controls
                               └─► Phase 6 (US4, T025–T028)   empty markers
                                      └─► Phase 7 (T029–T031)   the deck
                                             └─► Phase 8 (T032–T035)
```

- **T009 must precede T011.** The regression test is the safety net for restructuring a
  1,092-line component; writing it afterwards would prove only that the new code agrees
  with itself.
- **US1 before US3 before US2** is a deliberate inversion of priority order: the report has
  to honour an arrangement before there is any point storing one, and storing one has to
  work before controls can write to it.
- **T017 blocks T021–T023**, which call it.

## Parallel opportunities

- T004, T005 and T006 are three describe-blocks in one new file and can be written together.
- T010, T015, T016, T019, T020 and T025 extend two spec files and can be drafted in one pass.
- T032, T033 and T034 are independent checks over finished work.

Implementation tasks within a phase are largely sequential: T011–T014 all touch
`export-preview.tsx`, and T021–T024 all touch `export-picker-form.tsx`.

## Implementation strategy

**MVP is Phases 1–3.** A consultant can exclude sections and blocks and get a pack
containing exactly what they left ticked, correctly renumbered. That is the request in its
simplest form and is shippable alone — though the arrangement would not yet persist, so it
is an MVP for demonstration rather than for release.

**Phase 4 makes it releasable**, because an arrangement that does not survive the page is
not an arrangement.

**Phase 5 is the visible feature** — the panels from the mockup — and Phase 6 the smallest
increment, droppable from a first release without leaving anything broken.

**Phase 7 can lag.** A deck that ignores the arrangement is wrong but not broken, and the
report is what a client is usually sent.
