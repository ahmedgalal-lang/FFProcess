---

description: "Task list for 008-process-import"
---

# Tasks: Build a Process from a Spreadsheet

**Input**: Design documents from `/specs/008-process-import/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included, and not optional here. Constitution Principle III makes
test-first mandatory for business-rule logic, and deciding "is this file importable"
is exactly that. Every test task below must be written **and failing** before the
implementation task that follows it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on incomplete work
- **[Story]**: The user story this serves (US1–US4)

## Path Conventions

Next.js App Router at the repository root, per plan.md: pure rules in `lib/domain/`,
workbook generation in `lib/export/`, the write in `lib/actions/`, the download in
`app/api/`, UI under `app/(app)/`, tests in `tests/unit/` and `tests/e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the one declaration the generator and the parser both build
from, so they cannot drift (FR-002).

- [X] T001 Create `lib/domain/process-import.ts` with `FORMAT_VERSION = "process-import v1"` and a `SHEETS` declaration naming every sheet and its columns exactly as `contracts/workbook-template.md` specifies — this single export is what both the template generator and the parser read, and it is the reason the two cannot disagree
- [X] T002 [P] Add the transient types from `data-model.md` Part 1 to `lib/domain/process-import.ts`: `SourceRef`, `ParsedProcess`, `ParsedStep`, `ParsedConnection`, `ParsedRaciCell`, `ParsedAuthorityRule`, `ParsedKpi`, `ParsedExternalEntity`, `ImportProblem`, `ImportPlan`, `ImportSummary`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The provisional-id mechanism and the request boundary. Every user story
depends on both. **No user story can start until this phase is done.**

- [X] T003 Write failing unit tests for the provisional-id round trip in `tests/unit/process-import-source-ref.test.ts`: `toProvisionalId({sheet:"Steps",row:7})` → `"Steps!7"`, `fromProvisionalId` back again, and a sheet name containing `!` surviving the round trip unambiguously
- [X] T004 Implement `toProvisionalId` / `fromProvisionalId` and the human rendering (`"Steps, row 7"`) in `lib/domain/process-import.ts` per research R3 — this is the mechanism that lets the product's own validators run before anything has a database id
- [X] T005 Implement `readWorkbookSheets(file): Promise<Record<string, string[][]>>` in `lib/actions/process-import.ts`, reading every sheet to cell text with ExcelJS, reusing the `Buffer` interop cast and its comment from `readValueChainSheet` in `lib/actions/value-chain.ts:467`
- [X] T006 Create `lib/actions/process-import.ts` as a `"use server"` module with the `importProcess(formData)` Zod schema (`workspaceId`, `file`, `dryRun`), the `requireWorkspaceAccess(workspaceId, "EDITOR")` gate, and the 4 MB `MAX_IMPORT_BYTES` refusal — per `contracts/server-interfaces.md` §2
- [X] T007 Implement the template-identity check in `lib/domain/process-import.ts`: refuse a workbook missing any sheet in `SHEETS`, or whose `Read Me` format marker is absent or not `FORMAT_VERSION`, with a message naming what was expected (FR-022 and the older-release edge case, research R2)

**Checkpoint**: the action accepts a file, refuses anything that is not this template, and can address any cell by sheet and row.

---

## Phase 3: User Story 1 — Build a process from a filled-in workbook (Priority: P1)

**Goal**: A filled-in workbook becomes a complete process — steps in order, in their lanes, connected, with RACI and authority populated.

**Independent test**: Feed the parser a synthesized 22-step workbook and confirm the plan is complete; run the write and confirm the process opens complete on the Process Map, RACI Matrix and Authority Matrix.

### Tests (write first, must fail)

- [X] T008 [P] [US1] Write failing unit tests in `tests/unit/process-import.test.ts` covering each sheet parsed from synthesized rows: the `Process` key/value sheet, step order and the four types, multi-line `Detailed Actions` and `In Scope` cells, `Milestone` yes/no, connection labels, RACI letters, both authority measures, KPIs and external entities
- [X] T009 [P] [US1] Write failing unit tests in `tests/unit/process-import.test.ts` for name matching: a role spelled with different casing across sheets resolves to one role; an existing workspace role is matched, not duplicated (FR-012); a person named only in `Who (Person)` is collected (research R10)
- [X] T010 [P] [US1] Create the fixture builder `tests/fixtures/process-import-sample.ts` producing a 22-step process across several roles with labelled decision branches, RACI on every step, one money rule and one time rule, a KPI and an external entity — a module that exports the builder and runs no work on import, so specs can import it

### Implementation

- [X] T011 [US1] Implement `parseProcessSheet` and `parseStepsSheet` in `lib/domain/process-import.ts`: key/value process fields, step order with row order breaking ties, type parsing, multi-line cells split to arrays, `Swimlane Role` defaulting to `Assigned Role` when blank
- [X] T012 [US1] Implement `parseConnectionsSheet`, `parseRaciSheet` and `parseAuthoritySheet` in `lib/domain/process-import.ts`, resolving step references by label and carrying `SourceRef` on every parsed row
- [X] T013 [P] [US1] Implement `parseKpisSheet` and `parseExternalEntitiesSheet` in `lib/domain/process-import.ts`, shaped for the `Process.kpis` and `Process.externalEntities` JSON columns
- [X] T014 [US1] Implement role and person collection in `lib/domain/process-import.ts`: every distinct name from `Assigned Role`, `Swimlane Role`, RACI `Role` and authority `Who (Role)` / `Who (Person)`, case-insensitive with the first spelling kept, as `buildImportPlan` does in `lib/domain/value-chain-import.ts`
- [X] T015 [US1] Implement `parseWorkbook(sheets): ImportPlan` in `lib/domain/process-import.ts`, composing the sheet parsers into one plan
- [X] T016 [US1] Implement role and person resolution in `lib/actions/process-import.ts`: match existing workspace `Role`/`Person` by name case-insensitively, reusing the `findByName` approach from `lib/actions/value-chain.ts`, and create only what is missing (FR-012, FR-013)
- [X] T017 [US1] Implement the process and step write inside one `prisma.$transaction` in `lib/actions/process-import.ts`: `generateProcessCode` for the code (FR-014, never from the file), purpose/scope/KPIs/entities onto `Process`, and each `ProcessStep` positioned with `FIRST_STEP_X`, `STEP_X_SPACING` and `laneY` from `lib/domain/process-layout.ts` (research R11)
- [X] T018 [US1] Implement the connection write in `lib/actions/process-import.ts`: one `StepConnection` per parsed connection, labels carried through, resolving labels to the ids created in T017
- [X] T019 [US1] Implement the RACI write in `lib/actions/process-import.ts`: create one `Activity` with `relatedStepId` per step carrying a letter — the same lazy creation `setStepRaciCell` does at `lib/actions/raci.ts:87-93` — then one `RaciAssignment` per cell (research R4, SC-005)
- [X] T020 [US1] Implement the authority write in `lib/actions/process-import.ts`: one `AuthorityAssignment` keyed on `stepId` per step carrying rules, and its `AuthorityRule` rows in sheet order with measure, figure, direction, consequence and `whoRoleId`/`whoPersonId`
- [X] T021 [US1] Wire the commit path in `lib/actions/process-import.ts`: on `dryRun: false` with no problems, run the transaction and `revalidatePath` the workspace's processes page and the new process's pages, returning `created: { processId, code }`

**Checkpoint**: a synthesized workbook imports to a complete process. Verify by hand against quickstart scenario 2 once T037 has produced a real template to fill in.

---

## Phase 4: User Story 2 — See what will happen before anything is written (Priority: P1)

**Goal**: Nothing is written until the consultant has seen what will happen, and a file with any mistake creates nothing.

**Independent test**: Upload a file with several deliberate mistakes; confirm nothing is created and every mistake names its sheet and row.

### Tests (write first, must fail)

- [X] T022 [P] [US2] Write failing unit tests in `tests/unit/process-import-problems.test.ts` for each structural problem in `data-model.md` Part 3, every one asserting the sheet and row in the message: a connection naming a missing step, two steps sharing a name, an unrecognised step type, a missing process name, an empty template, a workbook that is not the template, a workbook claiming an older format version, and a file over the 300-step cap
- [X] T023 [P] [US2] Write failing unit tests in `tests/unit/process-import-problems.test.ts` for the domain rules reached through the real validators: a task with two Accountables, a task with none, a money rule with no figure, a rule naming nobody, and a rule naming both a role and a person — each asserting the reported row is the row the mistake is actually on
- [X] T024 [P] [US2] Write a failing unit test in `tests/unit/process-import-transaction.test.ts` that forces a failure part way through the write and asserts the database is exactly as it was: no process, no orphaned roles or people, no steps (FR-019)

### Implementation

- [X] T025 [US2] Implement the structural problem checks in `lib/domain/process-import.ts` per `data-model.md` Part 3, each producing an `ImportProblem` carrying its `SourceRef`, written in plain words rather than error codes
- [X] T026 [US2] Implement the RACI validator bridge in `lib/domain/process-import.ts`: build `RaciActivity[]` keyed by each step's provisional id, call **`validateRaciMatrix`** from `lib/domain/raci-validation.ts` unmodified, and turn each `RaciIssue` back into an `ImportProblem` at its source row (FR-021, research R3)
- [X] T027 [US2] Implement the authority validator bridge in `lib/domain/process-import.ts`: build `AuthorityTableRow[]` with provisional `rowId`/`ruleId`, call `validateAuthorityTable` from `lib/domain/authority-table.ts` unmodified, and map each `AuthorityIssue` back to its row
- [X] T028 [US2] Implement the connection validator bridge in `lib/domain/process-import.ts`: build the `Map<provisionalStepId, syntheticProcessId>` and call `validateConnections` from `lib/domain/process-graph.ts` unmodified, mapping each `ProcessGraphIssue` back to its row
- [X] T029 [US2] Implement the 300-step cap in `lib/domain/process-import.ts` as an ordinary problem naming the count, so an oversized file is refused rather than half-written (research R7)
- [X] T030 [US2] Implement `buildImportSummary` in `lib/actions/process-import.ts` producing every field in `data-model.md` Part 1's `ImportSummary`, including `nameAlreadyExists` and the existing-versus-new split for roles and people (FR-016, FR-013)
- [X] T031 [US2] Implement the dry-run path in `lib/actions/process-import.ts`: parse, validate, build the summary, return it, and write nothing — and make the commit path refuse outright when problems exist, so a client cannot skip the preview (FR-015, FR-018)
- [X] T032 [US2] Create `app/(app)/workspaces/[workspaceId]/processes/import-panel.tsx` — a client component with file selection, a dry-run submit, and the summary rendered as counts plus the named new roles and people, following the `ImportPanel` shape in `app/(app)/workspaces/[workspaceId]/value-chain/value-chain-setup.tsx`
- [X] T033 [US2] Render the problem list in `app/(app)/workspaces/[workspaceId]/processes/import-panel.tsx` as a table of sheet, row and what is wrong, and withhold the confirm control entirely while any problem stands (FR-017, SC-004)
- [X] T034 [US2] Implement confirm and decline in `app/(app)/workspaces/[workspaceId]/processes/import-panel.tsx`: confirm re-submits the file with `dryRun: false`, decline clears the panel and leaves nothing behind (FR-020, research R5) — give the decline control its own pending state so it stays focusable while the preview request is in flight
- [X] T035 [US2] Mount the panel in `app/(app)/workspaces/[workspaceId]/processes/page.tsx` inside the existing `canEdit` branch

**Checkpoint**: a broken file reports every problem by location and creates nothing; a good file previews and imports only on confirmation.

---

## Phase 5: User Story 3 — A template that explains itself (Priority: P2)

**Goal**: The consultant downloads a workbook that says what each sheet is for, what each column accepts, and shows a worked example.

**Independent test**: Hand the template to someone who has not seen it and see whether they can fill it in without asking what a column means.

### Tests (write first, must fail)

- [X] T036 [P] [US3] Write a failing unit test in `tests/unit/process-import-roundtrip.test.ts` that generates the template in memory, reads it back through `parseWorkbook`, and asserts zero problems and a plan matching the worked example — the standing proof that the generator and the parser have not drifted (FR-006)

### Implementation

- [X] T037 [US3] Create `lib/export/process-import-template.ts` generating the workbook from the `SHEETS` declaration in `lib/domain/process-import.ts`, following the ExcelJS style of `lib/export/xlsx.ts` — bold headers, the slate header fill, sensible column widths
- [X] T038 [US3] Add the `Read Me` sheet in `lib/export/process-import-template.ts`: the `Template format` / `FORMAT_VERSION` marker, the generated date, and one block per sheet stating what it is for and what each column accepts (FR-004)
- [X] T039 [US3] State the permitted values in the template itself in `lib/export/process-import-template.ts` — step types, RACI letters, measures, directions, consequences, `Yes`/`No` — so a consultant never has to remember them (FR-004)
- [X] T040 [US3] Add the worked example rows in `lib/export/process-import-template.ts`: a small complete process with a decision and two labelled branches, RACI on every step, one money rule and one time rule, a KPI and an external entity (FR-005)
- [X] T041 [US3] Create `app/api/template/process-import/[workspaceId]/route.ts` — `GET`, gated `requireWorkspaceAccess(workspaceId, "EDITOR")`, streaming the workbook with the attachment header, following the route shape of `app/api/export/raci/[processId]/route.ts` per `contracts/server-interfaces.md` §1
- [X] T042 [US3] Add the download link to `app/(app)/workspaces/[workspaceId]/processes/import-panel.tsx`, inside the same `canEdit` branch as the upload control
- [X] T043 [US3] Run `pnpm exec next typegen` after adding the route so the typed-route table includes it

**Checkpoint**: the template downloads, explains itself, and imports untouched.

---

## Phase 6: User Story 4 — Only editors, and only creating (Priority: P2)

**Goal**: A read-only user is offered no way in and is refused if they try; an import can only create.

**Independent test**: As a viewer, confirm no control appears and a direct request is refused.

### Tests (write first, must fail)

- [X] T044 [P] [US4] Write a failing e2e spec `tests/e2e/process-import-access.spec.ts` asserting, as a `VIEWER`: the Processes page shows neither control; `GET /api/template/process-import/{workspaceId}` returns `403`; and submitting the import action directly is refused **and creates nothing** — the last two are the assertions that matter, the first only proves a button was hidden (SC-007)
- [X] T045 [P] [US4] Write a failing e2e assertion in `tests/e2e/process-import.spec.ts` that importing a file naming an existing process's name creates a **separate** process and leaves the existing one byte-for-byte unchanged (FR-025, FR-026)

### Implementation

- [X] T046 [US4] Confirm and, if needed, correct the `EDITOR` gate on both entry points — `lib/actions/process-import.ts` and `app/api/template/process-import/[workspaceId]/route.ts` — so neither relies on the page having hidden anything (FR-023, Constitution Principle V)
- [X] T047 [US4] Confirm the write path in `lib/actions/process-import.ts` performs no `update` on any existing `Process`, `Role` or `Person` — existing ones are read and referenced only (FR-025, FR-026)
- [X] T048 [US4] Surface the "a process of that name already exists" warning from `summary.nameAlreadyExists` in `app/(app)/workspaces/[workspaceId]/processes/import-panel.tsx`, stating that a separate process will be created

**Checkpoint**: the boundary holds against a direct request, not just a hidden control.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T049 [P] Write `tests/e2e/process-import.spec.ts` for the full flow: download the template, upload it unedited, preview, confirm, and assert the process opens complete on the Process Map, RACI Matrix and Authority Matrix (quickstart scenarios 1 and 2)
- [X] T050 [P] Write `tests/e2e/process-import-a11y.spec.ts`: the panel, summary and problem list keyboard-reachable with visible focus, problems announced rather than signalled by colour alone, and axe-clean (Constitution Principle IV, quickstart scenario 6)
- [X] T051 Verify SC-005 by hand on an imported process, following scenario 7 in `specs/008-process-import/quickstart.md`: edit a step, add a RACI letter, export the RACI `.xlsx` and the report PDF, run the AI review — each behaving as on a hand-built process
- [X] T052 Verify the suite actually holds by mutation: break the provisional-id decoding in `lib/domain/process-import.ts`, remove the two-Accountables check, and make the transaction non-atomic — each must fail a named test. A mutation that passes means the test is decorative and needs rewriting before the task is done
- [X] T053 Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm vitest run` and `pnpm exec playwright test`, and fix what they find
- [X] T054 Read a workbook generated by `lib/export/process-import-template.ts` in a spreadsheet application and confirm the `Read Me` is legible, the columns are wide enough to read, and the worked example is obviously an example rather than data to keep

---

## Dependencies

```
Phase 1 Setup (T001-T002)
      │
      ▼
Phase 2 Foundational (T003-T007)   ← blocks every story
      │
      ├──────────────┬───────────────┬──────────────┐
      ▼              ▼               ▼              ▼
  US1 (T008-T021)  US2 (T022-T035)  US3 (T036-T043)  US4 (T044-T048)
      │              │               │              │
      └──────────────┴───────────────┴──────────────┘
                     ▼
              Phase 7 Polish (T049-T054)
```

**Between stories**:

- **US2 depends on US1's parser** (T011–T015) for something to validate. Its UI tasks
  (T032–T035) do not, and can be built against a stubbed summary.
- **US3 is independent in code** — the generator reads only the `SHEETS` declaration
  from Phase 1. But its round-trip test (T036) needs US1's parser, and a human cannot
  test US1 or US2 by hand until T037 exists to produce a file to fill in. Synthesized
  rows keep US1 and US2 testable without it.
- **US4 mostly verifies** what Phase 2 and US1 already built. T048 needs T030.

**Within US1**: T011–T015 are sequential (one file, composing parsers). T016 → T017 →
T018/T019/T020 → T021 is a real chain — connections, RACI and authority all need the
step ids T017 creates.

**Within US2**: T025–T029 are sequential (one file). T026, T027 and T028 each need
T004's provisional ids. T030 → T031 → T032 → T033/T034 → T035.

## Parallel Opportunities

- **Phase 1**: T002 alongside T001 once the file exists.
- **US1 tests**: T008, T009, T010 together — three separate files.
- **US2 tests**: T022, T023, T024 together.
- **Across stories, once Phase 2 is done**: US3's generator (T037–T040) runs fully
  parallel to US1's parser, since both depend only on the `SHEETS` declaration. This
  is the largest parallel win available and worth taking.
- **US4 tests**: T044 and T045 together.
- **Polish**: T049 and T050 together.

## Independent Test Criteria

| Story | Done when |
|---|---|
| **US1** | A filled-in workbook becomes a process that opens complete on the Process Map, RACI Matrix and Authority Matrix, with no further typing |
| **US2** | A file with deliberate mistakes creates nothing and names the sheet and row of every one; a good file writes only after an explicit confirm |
| **US3** | Someone who has not seen the template fills it in without asking what a column means, and the untouched template imports |
| **US4** | A viewer sees no control and a direct request is refused; an import creates a new process and changes no other |

## Implementation Strategy

**The MVP is US1 + US2 + US3, not US1 alone.** The usual "ship the first story" advice
does not fit here. US1 without US3 gives a consultant nowhere to get a file from, and
US1 without US2 is the thing the spec explicitly calls worse than not having the
feature — an import that can write half a process. The three ship together or the
feature does not work.

US4 can follow, but only in the sense that its tasks are largely *verification* of
boundaries Phase 2 and US1 already enforce. The `EDITOR` gate goes in at T006, not
later.

Suggested order: Phase 1 → Phase 2 → **US1 and US3 in parallel** → US2 → US4 → Polish.

Two things to hold on to while implementing:

- **T052 is not a formality.** This feature's whole safety claim is that a bad file
  creates nothing. A test that passes when atomicity is removed is not testing
  atomicity. Mutate and confirm each one fails.
- **The round-trip test (T036) is the drift alarm.** If the generator and the parser
  ever disagree, every other test here can still pass while the feature is broken for
  every real consultant.
