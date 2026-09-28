# Research: Risk Treatment Plans & Heat Map

## Decision 1 — The heat map counts what the register shows

`GovernanceRiskRegister` receives `risksForTab`: risks sourced from the
active aspect plus hand-added ones (tab scoping the user asked for earlier).
The heat map sits directly above that table and filters it on click, so it
must count the same rows, or a cell would filter to a different set than it
counted. The spec's FR-001 was clarified to say so. The workspace-wide
view is the dashboard's (026) and the exported report's (020).

## Decision 2 — Heat map as a real table of buttons

A `<table>` with likelihood row headers (High → Low, top to bottom, the
conventional orientation) and impact column headers (Low → Critical).
Each non-empty cell is a `<button aria-pressed>` whose accessible name
states the count, both axes and the derived level ("2 risks, likelihood
High, impact Critical, level High"), and whose visible text carries the
count and the level word — colour is never the only signal (FR-002).
Empty cells are plain text "0", not buttons. Colour bands reuse
`deriveRiskLevel` (Decision in `lib/domain/governance-risk.ts`).

## Decision 3 — Treatment fields live on the risk; actions are their own table

Strategy (`MITIGATE | TRANSFER | ACCEPT | AVOID`, nullable), rationale, and
target likelihood/impact are one-per-risk facts → columns on
`GovernanceRisk`. Treatment actions are many-per-risk with their own owner,
due date and completion → a new `GovernanceRiskTreatmentAction` table,
`onDelete: Cascade` from the risk (deleted with it), owner relations
`SetNull` (removing a role/person unassigns the action, keeps it).

## Decision 4 — Any treatment edit marks the risk hand-managed

`updateGovernanceRisk` already sets `handManaged: true` on any field change.
The new treatment actions do the same on their parent risk (FR-008) —
consistent, even though (as established in spec 018's research) a
regenerate never revisits an existing risk anyway.

## Decision 5 — Pure helpers, unit-tested

`lib/domain/risk-treatment.ts`: `heatMapCells(risks)` (counts and levels per
likelihood × impact, excluding Closed) and `isTreatmentActionOverdue(dueDate,
doneAt, today)`. Overdue is computed server-side in `page.tsx` and passed
down as a boolean, like `needsReview` (018) and checklist `overdue` (028).

## Decision 6 — Label the register's existing inline selects

The register's likelihood/impact/status selects have no accessible names;
the Governance page's axe test only passes because the demo workspace
usually has no risks when it runs. Adding `aria-label`s now, since this
feature adds more controls to the same rows.
