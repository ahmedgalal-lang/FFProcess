# Research: Policy Lifecycle

## Decision 1 — Lifecycle status is a new, independent field, not a repurposed one

`GovernancePolicyDraft.status` (`GovernanceItemStatus`: OPEN/EDITED/DONE/
DISMISSED) already exists and tracks whether the *recommendation* behind a
policy was acted on — shared with `GovernanceChecklistItem`, and set to
EDITED today the moment a consultant saves a hand edit (`updatePolicyDraft`).
This feature adds a second, independent field, `lifecycleStatus`
(`GovernancePolicyLifecycleStatus`: DRAFT/IN_REVIEW/APPROVED/PUBLISHED/
RETIRED), rather than repurposing or replacing `status`. The two answer
different questions — "has this recommendation been dealt with" vs. "is this
document reviewed and in force" — and a policy can be EDITED (content
touched) while still DRAFT (never submitted), or DONE (recommendation acted
on) while APPROVED (document reviewed). Conflating them would make either
axis lossy.

**Alternatives considered**: extending `GovernanceItemStatus` with new values
(IN_REVIEW, APPROVED, PUBLISHED, RETIRED) — rejected because that enum is
shared with `GovernanceChecklistItem`, which has no concept of an approval
workflow; adding those values would let a checklist item be set to PUBLISHED,
which is meaningless.

## Decision 2 — Actor attribution reuses the existing `User` model directly, not a new generic audit log

Every server action already resolves the caller via `requireWorkspaceAccess`,
which returns `access.data.userId` — a real row in the existing `User`
model (NextAuth). Version rows (`GovernancePolicyVersion.createdByUserId`)
and approval records (`GovernancePolicyDraft.approvedByUserId`) reference
`User` directly. This is deliberately narrower than the general-purpose
audit trail / activity log covering every governance entity, which is a
separate, larger, not-yet-built backlog item — this feature only needs to
attribute changes to *policies*, not build a generic activity log for the
whole app.

Verified: no code path in this app ever deletes a `User` row (only
`FirmMember` and `Member` records, which reference a `User` but don't remove
it — see `removeFirmMember`, `deleteWorkspace`). So the relation's default
referential action (SetNull for the optional `approvedByUserId`, Restrict
for the required `createdByUserId`) is a formality; it is never exercised in
practice.

## Decision 3 — No runtime guard needed for "regeneration never overwrites a non-Draft policy" (FR-010)

Traced `generateGovernanceAssessment` (`lib/actions/governance.ts`) end to
end: its reconciliation loop only ever creates a *new*
`GovernancePolicyDraft`, and only alongside a *newly created*
`GovernanceChecklistItem` — one whose title isn't already in
`trackedChecklistTitles` (built from every item the assessment already has,
via `partitionNewChecklistItems`). An item whose title is already tracked is
filtered out entirely before the loop runs, so its already-linked policy is
never revisited, updated, or recreated — regardless of that policy's
`handManaged` flag, `status`, or (once this feature ships) `lifecycleStatus`.
`governance-findings.ts`'s `isHandManaged` is consequently unused in
production code today (only referenced in comments and its own unit test) —
the real protection is structural, not a runtime check.

This means FR-010 is **already satisfied by existing behavior** — this
feature does not add a new guard to `generateGovernanceAssessment` or
`governance-findings.ts`. What it *does* add is a regression test
(integration-level) that regenerates an assessment after one of its policies
has left Draft and asserts nothing about that policy changed — pinning the
invariant now that it carries real product weight (SC-003), so a future
change to the reconciliation loop can't silently break it without a test
failing.

**Alternatives considered**: adding an explicit `lifecycleStatus !== "DRAFT"`
check into the reconciliation loop anyway, as defense in depth — rejected
per Constitution Principle VI (Simplicity): the loop structurally cannot
reach an existing policy, so a check that can never trigger is dead code,
not defense.

## Decision 4 — One shared save path creates version rows, for both AI-drafted and hand-written policies

`updatePolicyDraft` (edits, either path) and the policy-creation step inside
`generateGovernanceAssessment`'s transaction (first AI draft) and
`addGovernancePolicy` (hand-written from the Policy Library) are the only
three places a policy's title/body is ever set. All three insert a
`GovernancePolicyVersion` row in the same transaction as the
create/update — version 1 at creation, incrementing from there. No separate
"first version" special case in the read path: a policy with only one save
still has exactly one version row, so the version list is never empty.

## Decision 5 — Cascade behavior for the two new tables

- `GovernancePolicyVersion.policyId` → `GovernancePolicyDraft`, `onDelete:
  Cascade`: deleting a policy deletes its version history. Matches this
  schema's existing pattern (e.g. `GovernanceChecklistItem` → its policy is
  already Cascade) — nothing here is kept as an orphaned record once its
  parent is gone.
- `GovernancePolicyAcknowledgement.policyId` → `GovernancePolicyDraft`,
  `onDelete: Cascade`: same reasoning.
- `GovernancePolicyAcknowledgement.personId` → `Person`, `onDelete:
  Cascade`: an acknowledgement record about a person who no longer exists in
  the workspace's directory is removed with them — stated explicitly in
  spec.md's Edge Cases, matching how every other `Person`-linked record in
  this app already behaves on a `Person` delete (e.g. `RaciAssignment`,
  `PersonRole`).

## Decision 6 — Client-side Admin check reuses the existing `useWorkspaceAccess` hook

`useWorkspaceAccess()` (`app/(app)/workspaces/[workspaceId]/workspace-access.tsx`)
already exposes `accessLevel`, documented as existing for exactly this case
("the rarer cases that need to distinguish Admin"). Approve/Publish/Retire
controls gate on `useWorkspaceAccess().accessLevel === "ADMIN"`; no new hook
is introduced. The server side of every new action still enforces this
independently via `requireWorkspaceAccess(workspaceId, "ADMIN")`, per
Constitution Principle V — the client check only avoids showing a control
that would be refused.

## Decision 7 — Migration is additive; the spec 017 hand-authored-migration workaround does not apply here

Every schema change in this feature is additive: a new enum, four new
nullable/defaulted columns on `GovernancePolicyDraft`, two new tables, and
two new back-relation arrays on `User`/`Person`. No column is dropped, no
existing column's type or nullability changes, and every new
`GovernancePolicyDraft` column has a safe default or is nullable — so
existing rows need no backfill. Unlike spec 017's `focusArea` → `aspectId`
migration (which dropped a non-null enum column with existing data and hit
`prisma migrate dev`'s non-interactive refusal), this migration is exactly
the kind `prisma migrate dev --name policy_lifecycle` generates and applies
cleanly on its own, non-interactively — no hand-authored SQL required.
