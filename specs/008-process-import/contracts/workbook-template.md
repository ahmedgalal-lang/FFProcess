# Contract: The Process Import Workbook

**Feature**: `specs/008-process-import`

This is the contract between the consultant and the product. The template generator
writes exactly this; the importer accepts exactly this. They are built from one shared
declaration of the sheets and columns, so neither can drift from the other (FR-002).

**Format version**: `process-import v1`

A workbook is this template when it carries every sheet below **and** the format
marker on `Read Me`. Anything else is refused by name (FR-022), including a workbook
from an older release whose sheets no longer match.

Column order within a sheet is fixed — the product wrote the file. Headers sit on row
1 of each data sheet, so **data begins on row 2**, and a problem reported as "row 7"
is row 7 as the spreadsheet shows it.

---

## Sheet: `Read Me`

Not data. States what each sheet is for, what each column accepts, and carries the
format marker (FR-004).

| A | B |
|---|---|
| `Template format` | `process-import v1` |
| `Generated` | ISO date |
| ...one block per sheet, naming its columns and their permitted values... | |

---

## Sheet: `Process`

Key/value, not a table — one process per workbook.

| A (field) | B (value) | Accepts |
|---|---|---|
| `Process Name` | | Required. Free text |
| `Description` | | Free text |
| `Purpose` | | Free text |
| `In Scope` | | One item per line |
| `Out of Scope` | | One item per line |

No code column. The system generates the process code (FR-014).

---

## Sheet: `Steps`

| Column | Accepts | Required |
|---|---|---|
| `Order` | Whole number. Ties fall back to row order | no |
| `Type` | `START`, `TASK`, `DECISION`, `END` | yes |
| `Step Name` | Free text. **Must be unique in the file** — connections name steps by it | yes |
| `Assigned Role` | Role name. Reused if the workspace has it, created if not | no |
| `Swimlane Role` | Role name. Blank means the same as `Assigned Role` | no |
| `Detailed Actions` | One action per line | no |
| `Risk if Mishandled` | Free text | no |
| `Milestone` | `Yes` or `No`. Blank means `No` | no |

At least one step, at most 300.

---

## Sheet: `Connections`

| Column | Accepts | Required |
|---|---|---|
| `From Step` | A `Step Name` from the `Steps` sheet | yes |
| `To Step` | A `Step Name` from the `Steps` sheet | yes |
| `Label` | Free text — a decision's branch, typically `Yes` / `No` | no |

A name that is not on the `Steps` sheet is a problem against this row, never a
dangling connection.

---

## Sheet: `RACI`

One row per assignment, so a role the workspace has never met can still be used.

| Column | Accepts | Required |
|---|---|---|
| `Step Name` | A `Step Name` from the `Steps` sheet | yes |
| `Role` | Role name | yes |
| `Code` | `R`, `A`, `C` or `I` | yes |

Every step that appears here must have exactly one `A`, and at least one `R` — the
product's own rule, applied here unchanged.

---

## Sheet: `Authority`

One row per rule. A step may have several; they apply in row order.

| Column | Accepts | Required |
|---|---|---|
| `Step Name` | A `Step Name` from the `Steps` sheet | yes |
| `Measure` | `Money`, `Time`, `None` | yes |
| `Amount` | A number. Only with `Money` | with `Money` |
| `Days` | A whole number of days. Only with `Time` | with `Time` |
| `Direction` | `Greater than`, `Greater than or equal`, `Less than`, `Less than or equal`, `No approval required` | yes |
| `Consequence` | `Approval`, `Escalation` | yes |
| `Who (Role)` | Role name | one of the two |
| `Who (Person)` | Person name. Created if the workspace lacks them | one of the two |

`No approval required` pairs with `Measure` `None` and needs neither a figure nor a
who. Every other rule needs both, and naming a role *and* a person is a problem.

---

## Sheet: `KPIs`

| Column | Accepts | Required |
|---|---|---|
| `Metric` | Free text | yes |
| `Target` | Free text | no |
| `Frequency` | Free text | no |

---

## Sheet: `External Entities`

| Column | Accepts | Required |
|---|---|---|
| `Name` | Free text | yes |
| `Description` | Free text | no |

---

## The worked example

The template ships filled in with a small complete process — a few steps across two
roles, a decision with two labelled branches, RACI covering every step, one money rule
and one time rule, a KPI and an external entity (FR-005).

The example is not decoration. **The template as downloaded, unedited, must import**
(FR-006). That round trip is the standing proof that the generator and the importer
still agree, and it is a test, not a claim.
