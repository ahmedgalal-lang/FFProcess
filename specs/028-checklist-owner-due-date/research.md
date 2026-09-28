# Research: Checklist Item Owners & Due Dates

## Decision 1 — Extend the existing edit path, not a second one

`updateGovernanceChecklistItem` already edits phase, title and description
from the item's inline Edit form, leaving status alone. Owner and due date
join it as optional fields with explicit semantics: omitted = untouched,
`null` = cleared. One form, one action, one save — rather than a second
"assign" control beside Edit that does the same kind of thing.

## Decision 2 — Owner is a role or a person, never both, validated server-side

Mirrors `GovernanceRisk.ownerRoleId`/`ownerPersonId`. The action rejects a
payload naming both, and ownership-checks whichever is named against the
workspace (a role or person from another workspace is refused as
not-found). The form sends a single select value (`role:<id>`,
`person:<id>`, or empty), decoded client-side into the two fields.

## Decision 3 — `onDelete: SetNull` on both owner relations

FR-006: removing a role or person clears the owner and keeps the item. An
optional relation's default is already SetNull in this schema (verified in
spec 018's research against `governance_risks_ownerPersonId_fkey`), but it
is stated explicitly on these relations so the behavior doesn't rest on a
default.

## Decision 4 — Overdue is derived, server-side, like "needs review"

A pure `isChecklistItemOverdue(status, dueDate, today)` in
`lib/domain/checklist-due.ts`: overdue only when the due date has passed and
the item is neither DONE nor DISMISSED. `page.tsx` computes it per item with
`new Date()` and passes `overdue: boolean` down — the same shape spec 018
used for `needsReview` — so the client never compares dates itself.

## Decision 5 — Regeneration can't touch owners or dates

Verified in spec 018 (research Decision 3): `generateGovernanceAssessment`
only ever creates items whose titles aren't already tracked, and never
revisits an existing one. So existing owners and due dates are safe by
construction; a regression test pins it (FR-007).

## Decision 6 — The overdue count on an aspect tab only appears when non-zero

A tab's accessible name is what `getByRole("tab", { name })` matches across
the existing e2e suite. Adding ", 2 overdue" only when there are overdue
items keeps every existing tab name unchanged in the normal case.
