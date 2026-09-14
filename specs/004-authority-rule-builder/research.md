# Research: Authority Rule Builder

## 1. How many places read this data?

**Finding**: nineteen non-generated files reference the authority model. Counted by
grepping for `describeAuthorityRule`, `buildAuthorityTableRows`, `validateAuthorityTable`,
`AuthorityTableRow`, `coApprov`, `slaDays` and `escalationRoleId`:

| Area | Files |
| --- | --- |
| The matrix itself | `authority/authority-table.tsx`, `authority/page.tsx`, `lib/actions/authority.ts` |
| Domain | `lib/domain/authority-table.ts`, `process-report.ts`, `process-review.ts`, `step-authority-summary.ts`, `step-readiness.ts` |
| Report / exports | `reports/[workspaceId]/export-preview.tsx`, `lib/reports/load-report-data.ts`, `lib/export/xlsx.ts`, `lib/export/pdf/authority-pdf.tsx`, `lib/export/pptx/report-pptx.ts`, `api/export/authority/[processId]/route.ts` |
| Process Map | `map/page.tsx`, `map/map-nodes.tsx`, `map/process-map-canvas.tsx`, `map/static-process-map-diagram.tsx`, `map/map-view.tsx` |
| Elsewhere | `governance/page.tsx` (Key Control Points), `value-chain/page.tsx`, `lib/actions/ai-review.ts` |

**Decision**: this is the single most important input to the design. A change that alters
the shape every one of those files reads is a nineteen-file refactor with nineteen chances
to break a client-facing document.

**Rationale**: Constitution Principle VI (simplicity, incremental delivery) and the
session's own recent history — the Viewer gating work was a similar breadth and the bugs
came from breadth, not depth.

**Alternatives considered**: rewriting every consumer to iterate rules directly. Rejected:
most consumers want one fact ("what is this step's gate figure?", "does this row need an
approver?"), not the rule list.

---

## 2. Replace the existing table, or add a child table?

**Decision**: **Keep `AuthorityAssignment` as the per-task record and add a child
`AuthorityRule` table.** The parent keeps what is genuinely a fact about the task —
`skipped`, and the `stepId` / `activityId` link. The rule fields (`threshold`, `direction`,
`slaDays`, `approverRoleId`, `approverPersonId`, `coApprovalAboveThreshold`,
`coApproverRoleId`, `escalationRoleId`) move to the child, one row per rule.

**Rationale**:

- `skipped` and the task link are task-level, not rule-level. A skipped task is skipped
  regardless of how many rules it has. Moving them into a rule would be wrong.
- The parent already exists for every task that has any authority data, so the join that
  `buildAuthorityTableRows` does today keeps working unchanged in shape.
- It lets `AuthorityTableRow` gain a `rules: AuthorityRuleData[]` array while keeping every
  existing field name, so consumers that only read `row.skipped` or `row.label` do not
  change at all.

**Alternatives considered**:

- *Replace `AuthorityAssignment` with `AuthorityRule` entirely*, hanging rules directly off
  the step/activity. Cleaner on paper, but `skipped` then has no home, and every consumer
  changes at once.
- *Keep one row and store rules as JSON.* Rejected: Principle I (type-safe, validated at
  every boundary) and it makes "order the rules" and "count rules missing an approver" into
  application-side work the database should do.

---

## 3. How do nineteen consumers survive it?

**Decision**: keep `AuthorityTableRow`'s existing scalar fields as a **derived summary of
the rules**, and add the rule list alongside. The derivation is one documented function.

- `row.threshold` / `row.direction` → from the row's first money rule, else null/default.
- `row.slaDays` → from the row's first time rule, else null.
- `row.approverRoleId` / `approverPersonId` → from the first approval rule.
- `row.escalationRoleId` → from the first escalation rule.
- `row.coApprovalAboveThreshold` / `coApproverRoleId` → **removed**; a co-approver is now
  just a second approval rule, so nothing derives them.

**Rationale**: a consumer that asks "what figure does this decision gate on" gets the same
answer it got before, from one place. Only the consumers that genuinely need to show *all*
the rules — the matrix, the report, the deck, the spreadsheet — read `row.rules`.

**Consequence to plan for**: the co-approval fields disappear from the type, so every file
touching `coApprov*` must be visited. That is `authority-table.tsx`, `authority.ts`,
`process-report.ts`, `xlsx.ts`, `authority-pdf.tsx`, `ai-review.ts`, `process-review.ts`.

**Alternatives considered**: making every consumer iterate `rules` and pick for itself.
Rejected — that is the same rule written seven times, which is exactly how the gate line
drifted between the canvas and the deck before it was centralised.

---

## 4. Writing the migration without an interactive shell

**Finding**: `prisma migrate dev` refuses to run in this environment — it detects a
non-interactive shell and exits, even with `--create-only` and `CI=true`. This is Prisma 7
behaviour and there is no flag that bypasses it.

**Decision**: generate the SQL with `prisma migrate diff`, which is fully non-interactive,
write it into a hand-named migration directory, then apply with `prisma migrate deploy`.

```bash
prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > prisma/migrations/<timestamp>_authority_rules/migration.sql
```

Then append the data-backfill SQL to that same file, by hand, before applying — so the
schema change and the backfill land atomically in one migration rather than as two
migrations with a window in between where the rules table exists but is empty.

**Rationale**: matches how the two demo-identity migrations in this branch were written and
verified, and `migrate deploy` is what runs on the deployment (`start` is
`prisma migrate deploy && next start`), so the backfill reaches production the same way.

**Alternatives considered**: a one-off script run by hand after deploy. Rejected — nobody
would remember, and this branch has already been bitten once by a migration that had not
run where it was assumed to have run.

---

## 5. Backfill: turning one row into N rules

**Decision**: each existing `AuthorityAssignment` produces rules in this order, and the
order matters because it becomes the displayed order:

1. **A money rule**, if `threshold` is not null → `measure = MONEY`, `amount = threshold`,
   `direction` as recorded, `consequence = APPROVAL`, who = `approverRoleId` /
   `approverPersonId`.
2. **A second money rule**, if `coApprovalAboveThreshold` is not null → `measure = MONEY`,
   `amount = coApprovalAboveThreshold`, `direction = GREATER_THAN`,
   `consequence = APPROVAL`, who = `coApproverRoleId`. This is the co-approver becoming an
   ordinary second signer.
3. **A time rule**, if `slaDays` is not null → `measure = TIME`, `days = slaDays`,
   `direction = GREATER_THAN`, `consequence = ESCALATION`, who = `escalationRoleId`.

Special cases:

- `direction = EQUAL_NO_APPROVAL` → one rule carrying that direction and nothing else, so
  the row still reads as "no approval required" and still renders dimmed.
- An assignment with a `slaDays` but no `escalationRoleId` still produces the time rule,
  with nobody named. It then shows as an incomplete rule, which is true — and is exactly
  what the matrix said before by showing a turnaround with an empty Escalation cell.
- An assignment with none of the three → no rules. The task keeps its parent row (and its
  `skipped` flag) and reads as having no rules.

**Rationale**: direct from the spec's User Story 3 acceptance scenarios. Every recorded
value lands somewhere; nothing is invented.

**Verification planned**: build a fixture containing every combination the old shape
allowed, run the migration, and assert each converts as above — plus assert the migration
is a no-op the second time it runs (FR-019).

---

## 6. What the Process Map decision node shows

**Finding**: `gateLine(threshold, direction)` is called from `map/page.tsx` via
`step-authority-summary.ts`, and its output is drawn by `map-nodes.tsx` on the live canvas,
the static report diagram and the PPTX.

**Decision**: keep `gateLine`'s signature exactly as it is. Feed it from the derived
`row.threshold` / `row.direction` — i.e. the step's first money rule. A step with only time
rules passes `null` and draws no gate line, which is what a step with no threshold does
today.

**Rationale**: the spec records this as an assumption; keeping the signature means the
diamond, the printed diagram and the deck need no change at all, which removes three files
from the blast radius.

---

## 7. Prior art inside this codebase

**Finding**: `ProcessStep` and `Phase` already carry `order Int @default(0)` with an
established reorder pattern, and `lib/domain/process-order.ts` exists from feature 003.

**Decision**: give `AuthorityRule` the same `order Int @default(0)` and sort by
`[{ order: "asc" }, { createdAt: "asc" }]`, matching how `processStep` is already read in
`authority/page.tsx`.

**Rationale**: Principle II — one way to order things in this codebase, not a new one.
Reordering rules is out of scope, but the column costs nothing now and is what makes
"creation order, stably" true across page loads.

---

## 8. Accessibility of the two new controls

**Finding**: the demo used `aria-pressed` toggle buttons in a labelled group. Principle IV
requires keyboard operation and WCAG 2.1 AA, and the axe suite already scans this page
(`accessibility.spec.ts` covers the Authority matrix).

**Decision**: two `<button aria-pressed>` controls inside a `role="group"` with an
accessible name, matching the demo. Colour is never the only signal — each state also
changes its label weight and border.

**Rationale**: the existing axe test will catch regressions, and the emerald/amber pair
used in the demo has already been contrast-checked against both themes in this session's
empty-state fix.
