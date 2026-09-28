# Research: Vendor & Third-Party Risk Register

## Decision 1 — Flags are derived, not stored

Next review date = `lastDueDiligenceOn + reviewCycleMonths`; "Due diligence
overdue" once that's past; "Renewal within 60 days" / "Contract expired"
from `contractEndOn`. All derived by pure functions in
`lib/domain/vendors.ts` and computed server-side, like every other overdue
flag in this set.

## Decision 2 — Owner is a role or a person, SetNull

Same shape and rule as risks, checklist items and treatment actions.

## Decision 3 — Vendor–risk links are a join table, Cascade both sides

Deleting either the vendor or the risk removes only the link (FR-006),
the same design as spec 024's incident–risk links.

## Decision 4 — Its own action and component files

`lib/actions/vendors.ts`, `governance-vendors.tsx`.
