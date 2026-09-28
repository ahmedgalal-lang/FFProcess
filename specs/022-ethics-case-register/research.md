# Research: Ethics & Whistleblower Case Register

## Decision 1 — Admin-only is enforced on the server and in the page's data load

Every case action calls `requireWorkspaceAccess(workspaceId, "ADMIN")`.
The Governance page loads cases (and their count) only when the viewer's
own access level is ADMIN — the query is never issued for an Editor or
Viewer, so nothing about cases reaches their browser, not even an empty
list (FR-008, SC-002). A Firm Owner resolves to ADMIN through the existing
carve-out.

## Decision 2 — References come from a per-workspace counter, never reused

`CASE-0007` numbering: `max + 1` would reuse a number after the latest New
case is deleted (FR-007 allows deleting New cases). Instead
`Workspace.nextEthicsCaseNumber` is incremented atomically
(`update ... { increment: 1 }`) inside the same transaction as the insert,
and `@@unique([workspaceId, number])` backs it.

## Decision 3 — Notes are append-only: there is no update or delete action

The only note action is `addEthicsCaseNote`. Immutability is guaranteed by
there being no code path to change a note, not by a flag.

## Decision 4 — Deletion only while New

`deleteEthicsCase` refuses unless status is NEW (FR-007), with a message
explaining why.

## Decision 5 — Reporter identity only when not anonymous

`reporterName` is refused by the server when `anonymous` is true, and the
form doesn't render the field (FR-003).

## Decision 6 — Investigator: a person, or free text, and the name survives

`investigatorPersonId` (SetNull) plus `investigatorName` (always stored —
the person's name at assignment, or free text for someone outside the
client). If the person is later removed, the name remains.

## Decision 7 — Excluded everywhere else

Not read by the report loader (spec 020), not written to the activity log
(spec 019), and the dashboard (026) shows its tile only to Admins.
