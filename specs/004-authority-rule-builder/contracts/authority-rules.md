# Contracts: Authority Rule Builder

The surfaces this feature exposes. Each is a boundary something else depends on, so each
gets a test.

## 1. Server actions — `lib/actions/authority.ts`

All require `EDITOR` on the workspace (Principle V) and validate with Zod before touching
business logic (Principle I).

| Action | Input | Returns |
| --- | --- | --- |
| `addAuthorityRule` | `{ workspaceId, processId, rowId, kind }` | the created rule |
| `updateAuthorityRule` | `{ workspaceId, ruleId, measure?, amount?, days?, direction?, consequence?, whoRoleId?, whoPersonId? }` | the updated rule |
| `deleteAuthorityRule` | `{ workspaceId, ruleId }` | ok |
| `setAuthoritySkipped` | `{ workspaceId, processId, rowId, kind, skipped }` | ok — unchanged behaviour |

Invariants enforced at this boundary, not only in the database:

- `measure = MONEY` → `amount` present, `days` absent.
- `measure = TIME` → `days` present, `amount` absent.
- `measure = NONE` → both absent, `direction = EQUAL_NO_APPROVAL`.
- `whoRoleId` and `whoPersonId` are mutually exclusive.
- Switching `measure` clears the figure belonging to the other measure (FR-003) — the
  action does this, so a client that forgets cannot persist a stale figure.
- A rule is created at `order = max(order) + 1` within its assignment.

`addAuthorityRule` creates the parent `AuthorityAssignment` on demand if the task has none,
the same way the current per-field actions do.

## 2. Domain — `lib/domain/authority-table.ts`

Pure and framework-free, tested first (Principle III).

```ts
buildAuthorityTableRows(steps, activities, assignments): AuthorityTableRow[]
```
Unchanged signature. `assignments` now carry `rules`. Each returned row carries `rules`
plus the derived scalars.

```ts
deriveRowSummary(rules): { threshold, direction, slaDays, approverRoleId, approverPersonId, escalationRoleId }
```
NEW. The single definition of "first money rule", "first time rule", "first approval rule",
"first escalation rule". Called by `buildAuthorityTableRows`; exported so it can be tested
directly.

```ts
describeAuthorityRule(rule, names): string
```
CHANGED — now describes **one rule**, not a whole row. One sentence:
- money + approval → `"More than $10,000 needs approval from AP Clerk."`
- money + no who → `"More than $10,000 needs approval."`
- time + escalation → `"If more than 2 days pass, it escalates to Procurement Lead."`
- time + approval → `"If more than 2 days pass, it needs approval from Controller."`
- `NONE` → `"No approval required — this step proceeds on its own."`

```ts
describeAuthorityRow(row, namesByRuleId): string[]
```
NEW. Every rule's sentence, in order. This is what the report, the deck and the spreadsheet
print. A row with no rules returns `[]`.

```ts
validateAuthorityTable(rows): AuthorityIssue[]
```
CHANGED — issue types per data-model.md; each issue carries `ruleId` where it is about a
rule.

```ts
gateLine(threshold, direction): string | null
```
UNCHANGED, deliberately. Fed from the derived `row.threshold` / `row.direction`.

## 3. Report data — `lib/reports/load-report-data.ts`

`ExportProcessData` gains the rule sentences per task, replacing the single sentence. The
report preview, the PDF and the PPTX all read the same array, in the same order, so they
cannot disagree (the reason `gateLine` was centralised earlier in this branch).

## 4. Exports

| Surface | Change |
| --- | --- |
| Export Report preview / PDF | prints every rule sentence under a task, in order |
| PPTX | same list, same order |
| Authority XLSX | one spreadsheet row per rule, with the task repeated |
| Authority PDF download | same list, same order |

## 5. UI — the matrix

- Two `aria-pressed` buttons in a named `role="group"` for the measure; two more for the
  consequence.
- The figure input swaps between a currency field and a days field.
- An "add another approval" control per task.
- A delete control per rule.
- The `Then` column header.
- Every one of these controls is hidden from a Viewer (`useCanEdit`), while every rule and
  every figure stays visible — the pattern established in commit `23a34ab`.
