# Phase 1 Data Model: Build a Process from a Spreadsheet

**Feature**: `specs/008-process-import` | **Date**: 2026-09-19

This feature adds **no database tables and no migration**. It writes existing ones.
What is new is a set of in-memory shapes that live for the length of one request.

---

## Part 1 — Transient entities (new)

All of these live in `lib/domain/process-import.ts`, a pure module: rows of cell text
in, a checked plan out. Nothing in it reads a file or touches the database, so every
parsing and matching rule is unit-testable (Constitution Principle III).

### `SourceRef`

Where something came from, so a problem can be pointed at (FR-017, SC-004).

| Field | Type | Notes |
|---|---|---|
| `sheet` | `string` | The sheet name as written in the workbook |
| `row` | `number` | 1-based, matching what the spreadsheet shows |

Rendered to the consultant as `Steps, row 7`. Encoded as a **provisional id** —
`` `${sheet}!${row}` `` — when feeding the existing validators (research R3), and
decoded back on the way out.

### `ParsedProcess`

| Field | Type | Source | Notes |
|---|---|---|---|
| `name` | `string` | `Process` sheet | Required; an empty one makes the file empty |
| `description` | `string \| null` | `Process` sheet | |
| `processPurpose` | `string \| null` | `Process` sheet | |
| `inScope` | `string[]` | `Process` sheet | One per line in the cell |
| `outOfScope` | `string[]` | `Process` sheet | One per line in the cell |

No `code`. The system generates it (FR-014) and the template does not offer a cell
for one.

### `ParsedStep`

| Field | Type | Notes |
|---|---|---|
| `order` | `number` | From the sheet's `Order` column; ties broken by row |
| `type` | `"START" \| "TASK" \| "DECISION" \| "END"` | Anything else is a problem |
| `label` | `string` | Required, and unique across the file |
| `assignedRole` | `string \| null` | Role name |
| `swimlaneRole` | `string \| null` | Role name; defaults to `assignedRole` when blank |
| `detailedAction` | `string[]` | One action per line in the cell |
| `exceptionHandling` | `string \| null` | The template calls it "Risk if Mishandled" |
| `milestone` | `boolean` | `Yes`/`No` |
| `source` | `SourceRef` | |

### `ParsedConnection`

| Field | Type | Notes |
|---|---|---|
| `fromLabel` | `string` | Must name a step in the file |
| `toLabel` | `string` | Must name a step in the file |
| `label` | `string \| null` | Optional edge label — a decision's branch, typically |
| `source` | `SourceRef` | |

### `ParsedRaciCell`

| Field | Type | Notes |
|---|---|---|
| `stepLabel` | `string` | |
| `roleName` | `string` | |
| `code` | `RaciCode` | From `R`/`A`/`C`/`I`; reuses the existing union |
| `source` | `SourceRef` | |

### `ParsedAuthorityRule`

| Field | Type | Notes |
|---|---|---|
| `stepLabel` | `string` | |
| `order` | `number` | Position within that step's rules; row order |
| `measure` | `"MONEY" \| "TIME" \| "NONE"` | |
| `amount` | `number \| null` | Set only when `MONEY` |
| `days` | `number \| null` | Set only when `TIME` |
| `direction` | `AuthorityDirection` | The five existing values, by phrase |
| `consequence` | `"APPROVAL" \| "ESCALATION"` | |
| `whoRole` | `string \| null` | Role name — never both this and `whoPerson` |
| `whoPerson` | `string \| null` | Person name |
| `source` | `SourceRef` | |

### `ParsedKpi` / `ParsedExternalEntity`

`{ metric, target, frequency, source }` and `{ name, description, source }`. Both land
in the `Process.kpis` / `Process.externalEntities` JSON columns in the shape those
columns already document.

### `ImportProblem`

One thing wrong with the file (FR-017).

| Field | Type | Notes |
|---|---|---|
| `source` | `SourceRef` | Always present — every problem names a row |
| `message` | `string` | Plain words a consultant can act on, no error codes |

### `ImportPlan`

What the parser returns.

| Field | Type |
|---|---|
| `process` | `ParsedProcess` |
| `steps` | `ParsedStep[]` |
| `connections` | `ParsedConnection[]` |
| `raci` | `ParsedRaciCell[]` |
| `authority` | `ParsedAuthorityRule[]` |
| `kpis` | `ParsedKpi[]` |
| `externalEntities` | `ParsedExternalEntity[]` |
| `roleNames` | `string[]` | Every distinct role named anywhere, first spelling wins |
| `personNames` | `string[]` | Every distinct person named in Authority |
| `problems` | `ImportProblem[]` | Empty means importable |

### `ImportSummary`

What the consultant confirms against (FR-015, FR-016). Shown, never stored.

| Field | Type | Notes |
|---|---|---|
| `processName` | `string` | |
| `nameAlreadyExists` | `boolean` | Drives the "a process of that name exists" warning |
| `stepCount` / `connectionCount` | `number` | |
| `raciCount` / `authorityRuleCount` | `number` | |
| `kpiCount` / `externalEntityCount` | `number` | |
| `existingRoles` / `newRoles` | `string[]` | FR-013 — new ones named before confirming |
| `existingPeople` / `newPeople` | `string[]` | |
| `problems` | `ImportProblem[]` | Non-empty means the confirm control is not offered |

---

## Part 2 — Persisted entities (existing, written by the import)

Written inside one `prisma.$transaction` (FR-019). Nothing is updated; everything is
created, except roles and people that already exist by name, which are only read
(FR-012, FR-025, FR-026).

| Model | Written | Notes |
|---|---|---|
| `Process` | created, 1 | `code` from `generateProcessCode`; purpose/scope/KPIs/entities set here |
| `Role` | created, 0..n | Only names the workspace lacks; matched case-insensitively |
| `Person` | created, 0..n | Only from Authority's `Who (Person)` |
| `ProcessStep` | created, 1 per parsed step | `order`, `positionX`/`positionY` from `lib/domain/process-layout.ts` |
| `StepConnection` | created, 1 per parsed connection | Labels carried through |
| `Activity` | created, 1 per step carrying RACI or authority | `relatedStepId` set, as `setStepRaciCell` does |
| `RaciAssignment` | created, 1 per parsed cell | Keyed `activityId` + `roleId` |
| `AuthorityAssignment` | created, 1 per step carrying rules | Keyed on `stepId` |
| `AuthorityRule` | created, 1 per parsed rule | `order` within its assignment |

Not touched: `ProcessCategory`, `Phase`, `PersonRole`, `RaciMatrixStatus`,
`ReviewFinding`, `ProcessStepLink`, and every other `Process` in the workspace.

---

## Part 3 — Validation rules

### Structural (the parser's own)

| Rule | Problem reported against |
|---|---|
| The workbook has every required sheet and the expected format version | The file as a whole |
| The process has a name | `Process` sheet |
| At least one step | `Steps` sheet |
| A step has a label | its row |
| A step's type is one of the four | its row |
| Step labels are unique across the file | the second row using the label |
| A connection names two steps present in the file | its row |
| A RACI row names a step present in the file | its row |
| A RACI code is one of `R`, `A`, `C`, `I` | its row |
| An authority row names a step present in the file | its row |
| An authority rule names a role or a person, not both | its row |
| Direction and consequence are recognised values | its row |
| Step count within the 300 cap | `Steps` sheet |

### Domain (the product's own, reused unmodified — FR-021)

| Rule | Validator | Fed with |
|---|---|---|
| Exactly one Accountable per task; a Responsible | `validateRaciMatrix` | provisional `activityId` = the step's `Steps!row`; `roleId` = the role's first-seen name |
| A money rule carries a figure; every rule has somebody | `validateAuthorityTable` | provisional `rowId`/`ruleId` from `Authority!row` |
| A connection joins two steps of one process | `validateConnections` | provisional step ids, all mapped to one synthetic process id |

Each returned issue is turned into an `ImportProblem` by decoding its provisional id
back to a `SourceRef` and writing the rule in words.

---

## Part 4 — State transitions

There is one, and it only moves forward on an explicit human act:

```
uploaded file
   │
   ├─ not the template ─────────────► refused, nothing written        (FR-022)
   │
   └─ parsed ──► problems found? ──yes──► summary shown, no confirm   (FR-018)
                      │                    control offered; nothing written
                      no
                      │
                      ▼
                 summary shown ──► consultant declines ──► nothing    (FR-020)
                      │
                      └─ consultant confirms ──► one transaction ──► process exists
                                                      │
                                                      └─ fails ──► nothing  (FR-019)
```
