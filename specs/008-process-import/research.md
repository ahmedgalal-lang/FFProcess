# Phase 0 Research: Build a Process from a Spreadsheet

**Feature**: `specs/008-process-import` | **Date**: 2026-09-19

Every unknown in the Technical Context is resolved below. No `NEEDS CLARIFICATION`
remains.

---

## R1. File format and library

**Decision**: `.xlsx`, read and written with ExcelJS (`exceljs@^4.4.0`).

**Rationale**: ExcelJS is already a dependency and is already used on both sides of
this problem — `lib/export/xlsx.ts` writes the RACI and Authority workbooks, and
`readValueChainSheet` in `lib/actions/value-chain.ts` reads an uploaded one. Adding
nothing satisfies Constitution Principle VI, and the spec's Assumptions already
settle "a spreadsheet, because that is what consultants already use".

**Alternatives considered**:

- **CSV**: one process needs seven related tables; CSV gives one. Rejected.
- **A JSON file**: unfillable at a workshop, which is the whole point.
- **A different xlsx library (`sheetjs`)**: a second library for a job the existing
  one already does on both sides.

---

## R2. How the importer recognises its own template

**Decision**: identify by **sheet names plus an explicit format-version marker**, not
by sniffing header rows. The workbook carries a `Read Me` sheet whose first cell pair
is `Template format` / `process-import v1`. A file missing any required sheet, or
carrying a different version string, is refused by name.

**Rationale**: this is the opposite situation from the value-chain importer.
`matchHeaders` there scans arbitrary consultant-built workbooks and must be
forgiving. Here the product generated the file (FR-002), so it is entitled to
recognise it exactly — and FR-022 plus the "template from an older release" edge case
both require refusal rather than partial understanding. Header sniffing would
silently import the columns that still line up, which is precisely what the spec
forbids.

**Alternatives considered**:

- **Header matching, as `matchHeaders` does**: makes the older-release edge case
  unimplementable.
- **A hidden sheet holding the version**: hidden state a consultant can neither see
  nor repair. The marker sits in plain sight on `Read Me`.

---

## R3. Reusing the product's validators when nothing has an id yet

**Decision**: the parser assigns each parsed entity a **provisional id** of the form
`"<sheet>!<row>"` (e.g. `Steps!7`), builds the existing validators' inputs from those
ids, and maps each returned issue back to its sheet and row.

**Rationale**: this is the single hardest fit in the feature, and the finding that
drove the design. All three validators key on database ids:

| Validator | Location | Keys on |
|---|---|---|
| `validateRaciMatrix` | `lib/domain/raci-validation.ts` | `activityId`, `roleId` |
| `validateAuthorityTable` | `lib/domain/authority-table.ts` | `rowId`, `ruleId` |
| `validateConnections` | `lib/domain/process-graph.ts` | `Map<stepId, processId>` |

Nothing is written before the summary (FR-015, FR-018), so no real id exists at
validation time. A provisional id that encodes its own origin satisfies both
constraints at once: the validators run unmodified on it (FR-021 — the same rules,
not a restatement), and every issue they return decodes straight back into "sheet
`RACI`, row 12" for the problem list (FR-017, SC-004).

Note the corrected name: the validator is **`validateRaciMatrix`**, not
`validateRaciTable` as the feature description guessed. `validateRaciTable` does not
exist.

**Alternatives considered**:

- **Reimplementing the rules against names**: two copies of "exactly one Accountable"
  that can drift. Directly contrary to FR-021 and Constitution Principle II.
- **Writing to the database inside a rolled-back transaction to get real ids**:
  produces real ids, but burns a write transaction on every preview, and leaves the
  process-code sequence and any database-level side effects to reason about. Rejected
  as more dangerous than the problem it solves.

---

## R4. Where RACI assignments actually attach

**Decision**: the importer creates one `Activity` per step that carries a RACI letter
or an authority rule, with `relatedStepId` set — exactly what `setStepRaciCell` does
lazily today (`lib/actions/raci.ts:87-93`).

**Rationale**: `RaciAssignment` hangs off `Activity`, not `ProcessStep`. A hand-built
process only grows an `Activity` for a step at the moment someone first types a RACI
letter into that step's row. If the importer attached RACI any other way, an imported
process would differ structurally from a hand-built one, breaking SC-005. Following
the existing lazy-create path means it cannot.

`AuthorityAssignment` accepts either `stepId` or `activityId`; the importer keys it on
`stepId`, which is what the Authority Matrix does for a step that has not been split
into finer activities.

**Alternatives considered**:

- **Creating an `Activity` for every step unconditionally**: leaves empty activities a
  hand-built process would not have.

---

## R5. Preview and commit without server-side state

**Decision**: one server action, `importProcess(formData)`, with a `dryRun` boolean.
The file is uploaded again with the confirmation and re-parsed. Nothing about the
parse is stored between the two calls.

**Rationale**: `importValueChain` already works this way and it is the pattern the
codebase reads as "an import". It also matches the spec's Key Entities verbatim — the
parsed import "exists only for the length of the request", the summary is "shown, not
stored". Re-parsing is deterministic, so the confirmed import is the one previewed.
Declining costs nothing because nothing was kept (FR-020).

**Alternatives considered**:

- **Caching the parse server-side behind a token**: introduces storage, an expiry
  policy, and a cleanup path, for a file that takes milliseconds to re-read.
- **Holding the parse in the client and committing that**: the client could alter it
  between preview and commit, so the server would have to re-validate anyway — and
  then the upload was the cheaper half.

---

## R6. Atomicity

**Decision**: the entire write runs inside a single `prisma.$transaction(async (tx) => …)`.

**Rationale**: FR-019 demands all-or-nothing, and the spec calls a half-built process
worse than no feature. One transaction is how `importValueChain` already does it. The
write is bounded (R7), so transaction duration is not a concern at this scale.

---

## R7. Guarding a very large file

**Decision**: two limits — **4 MB** on the upload (the `MAX_IMPORT_BYTES` constant the
value-chain importer already uses) and **300 steps** on the parsed process, refused as
an ordinary import problem naming the count.

**Rationale**: the "very large file" edge case requires import *or* refusal, never a
half-write. A byte limit alone does not bound the work, since a small file can
describe an enormous process; a step cap bounds the transaction. 300 is an order of
magnitude past the 22-step process in SC-002 — large enough never to catch real work,
small enough to keep one transaction quick.

---

## R8. Template download endpoint

**Decision**: a `GET` route handler at
`app/api/template/process-import/[workspaceId]/route.ts`, gated with
`requireWorkspaceAccess(workspaceId, "EDITOR")`.

**Rationale**: mirrors the five existing export routes under `app/api/export/`, which
already stream an ExcelJS buffer with a `Content-Disposition` attachment header. Note
those routes gate at `VIEWER`; this one gates at `EDITOR`, because FR-024 makes the
download itself an editor-only capability and Principle V requires that check on the
server, not merely in the page that hides the button.

---

## R9. RACI in long form, not a grid

**Decision**: the `RACI` sheet is one row per assignment — `Step Name`, `Role`,
`Code` — rather than a grid with a column per role.

**Rationale**: a grid needs its role columns fixed when the template is generated, but
a consultant meets roles during the workshop and the workspace may have none yet. The
long form accepts a role that did not exist when the file was downloaded, and gives
FR-017 a genuine row to point at. It also lets FR-004 state what the `Code` column
accepts (`R`, `A`, `C`, `I`) in one place.

**Alternatives considered**:

- **A grid matching the RACI export**: reads better, but cannot carry a role the
  workspace has not met, and a problem in it has no row to name.

---

## R10. People

**Decision**: no People sheet. A person is created only when named in the Authority
sheet's `Who (Person)` column and no person of that name exists.

**Rationale**: the spec puts "importing the org directory" out of scope, so a sheet of
people would be that feature by another name. But FR-013 still requires the import to
create a person the workspace lacks, because an authority rule must land on somebody.
Deriving people from the one column that references them satisfies both.

---

## R11. Map layout for imported steps

**Decision**: position steps with `FIRST_STEP_X`, `STEP_X_SPACING` and `laneY` from
`lib/domain/process-layout.ts`, lanes ordered by first appearance.

**Rationale**: the same constants the Process Map uses when a step is added by hand,
and the same ones `importValueChain` uses. An imported map therefore opens laid out
the way a hand-built one does, which is SC-005 again.
