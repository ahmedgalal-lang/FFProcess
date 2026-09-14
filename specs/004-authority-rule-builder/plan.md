# Implementation Plan: Authority Rule Builder

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-authority-rule-builder/spec.md`

## Summary

Turn the Authority Matrix row from "one task with five fixed columns" into "one task with a
list of rules", where each rule is one statement: what it turns on (money or time), the
figure, which side of it, and what happens then (approval or escalation) and to whom.

The design decision that shapes everything else: **keep `AuthorityAssignment` as the
per-task record and hang a new ordered `AuthorityRule` child off it**, rather than replacing
it. Nineteen non-generated files read this data, and most of them want one fact ("what
figure does this decision gate on?"), not the list. Keeping the parent — and keeping
`AuthorityTableRow`'s existing scalar fields as a *derived* summary of the rules — means
only the four surfaces that genuinely show all the rules have to change how they read, and
`gateLine` keeps its signature so the Process Map, the printed diagram and the deck need no
change at all.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Next.js 16 App Router, React 19

**Primary Dependencies**: Prisma 7 + `@prisma/adapter-pg`, Zod 4, Tailwind v4, pptxgenjs,
exceljs, `@react-pdf/renderer`

**Storage**: PostgreSQL. One new table (`authority_rules`), two new enums, seven columns
dropped from `authority_assignments`.

**Testing**: Vitest for domain/unit (391 today), Playwright for e2e (67 today), axe via
`@axe-core/playwright` on the Authority page.

**Target Platform**: Web, deployed on Cranl; `start` is `prisma migrate deploy && next start`,
so the migration and its backfill reach production automatically.

**Project Type**: Single Next.js web application.

**Constraints**: No loss of any recorded authority value (FR-015) — this is delivered client
work. `prisma migrate dev` cannot run here (non-interactive shell); SQL is generated with
`prisma migrate diff` and applied with `migrate deploy`.

**Scale/Scope**: 19 non-generated files touch this model; ~6 of them change meaningfully.
Seeded demo has 9 assignments producing ~14 rules after conversion.

## Constitution Check

| Principle | Assessment |
| --- | --- |
| **I. Type-Safe Full-Stack** | PASS. New enums are Prisma-generated types; the four server actions validate with Zod at the boundary, including the cross-field invariants (`MONEY` ⇒ amount and no days). No `any`. |
| **II. Shared Domain Model** | PASS, and improved. A co-approver stops being a special field and becomes an ordinary rule pointing at the same shared Role/Person entities. Rule ordering reuses the `order Int @default(0)` pattern already used by `ProcessStep` and `Phase` rather than inventing a second one. |
| **III. Test-First for Business Rules** | PASS, and this is the principle with the most work attached. `deriveRowSummary`, `describeAuthorityRule`, `describeAuthorityRow` and `validateAuthorityTable` are all business rules and all get failing tests first. The migration backfill is also a business rule — "no recorded value is lost" — and gets a fixture covering every combination the old shape allowed, asserted before the migration is written. |
| **IV. Accessible, Data-Dense UI** | PASS. Two `aria-pressed` groups with accessible names; state signalled by border and weight as well as colour; the existing axe scan on this page is the gate. Keyboard operation of the new controls is an explicit task, not a follow-up. |
| **V. Workspace Isolation & Least Privilege** | PASS. All four actions require `EDITOR`. The Viewer gating pattern from `23a34ab` extends to the new controls: rules and figures stay visible, every control that changes one disappears. |
| **VI. Simplicity & Incremental Delivery** | PASS with one note. The simpler-looking option — replace `AuthorityAssignment` outright — is not simpler in practice: it strands `skipped` and forces all nineteen consumers to change at once. Keeping the parent is the smaller change. Rule *reordering* is deliberately not built (spec Out of Scope) even though the `order` column would allow it. |

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```
specs/004-authority-rule-builder/
├── spec.md
├── plan.md              # this file
├── research.md          # the eight decisions behind it
├── data-model.md        # AuthorityRule, the changed read model, the backfill
├── quickstart.md        # how to prove it works
├── contracts/
│   └── authority-rules.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
prisma/
├── schema.prisma                                   # + AuthorityRule, + 2 enums, − 7 columns
└── migrations/<ts>_authority_rules/migration.sql   # schema + backfill, one file

lib/
├── domain/authority-table.ts                       # the centre of the change
├── actions/authority.ts                            # 4 rule actions replace the field actions
├── reports/load-report-data.ts                     # rule sentences per task
├── export/xlsx.ts                                  # one spreadsheet row per rule
├── export/pdf/authority-pdf.tsx
├── export/pptx/report-pptx.ts
└── domain/{process-report,process-review,step-authority-summary}.ts   # co-approval removal

app/(app)/workspaces/[workspaceId]/processes/[processId]/
├── authority/authority-table.tsx                   # the rule builder UI
└── authority/page.tsx                              # include rules in the query

app/reports/[workspaceId]/export-preview.tsx        # print every rule

tests/
├── unit/authority-table.test.ts                    # derivation, sentences, validation
├── unit/authority-migration.test.ts                # NEW — backfill fixture
└── e2e/authority-rules.spec.ts                     # NEW — build, multi-rule, viewer, exports
```

**Structure Decision**: Existing single-application layout; no new top-level directories.
The feature is a domain change (`lib/domain/authority-table.ts`) with a UI on top and four
export surfaces reading it, which matches how features 001–003 were organised.

## Phase sequencing

The order is dictated by one thing: **the migration must be provably safe before any UI
depends on it.**

1. **Domain first, against the new shape.** Write `deriveRowSummary`,
   `describeAuthorityRule`, `describeAuthorityRow`, and the new `validateAuthorityTable`
   with failing tests. No database involved.
2. **Schema and backfill.** Generate the SQL with `prisma migrate diff`, hand-append the
   backfill, and verify against a fixture holding every old-shape combination — including
   the re-run no-op.
3. **Server actions.** The four rule actions, with their Zod invariants.
4. **The matrix UI.** The rule builder, the add and delete controls, the `Then` column, and
   the Viewer gating.
5. **The four read surfaces.** Report preview/PDF, PPTX, XLSX, Authority PDF — all reading
   the one ordered sentence list.
6. **Sweep the co-approval removal.** The seven files still referencing `coApprov*`.

Steps 1–2 are where the risk is. Steps 4–6 are mechanical once the read model is settled.

## Risks

| Risk | Mitigation |
| --- | --- |
| Backfill silently drops a value | Fixture covering every old-shape combination, asserted before the migration is written (Principle III applied to data, not just code) |
| Migration runs where it is not expected to — or does not run where it is | This branch has already been bitten by exactly this. The quickstart verifies against a real database, and deployment is verified on the live URL rather than the deploy status |
| A consumer silently keeps reading a dropped field | TypeScript: removing the fields from the type makes every one of the seven `coApprov*` sites a compile error rather than a runtime surprise |
| The report and the deck disagree about a task's rules | Both read one ordered array from `load-report-data.ts`, the same fix already applied to `gateLine` in `a6c82ae` |
| Two toggle groups add an accessibility violation | The axe scan on this page is already in the suite and is a release gate |
