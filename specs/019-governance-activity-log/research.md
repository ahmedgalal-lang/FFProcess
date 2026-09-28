# Research: Governance Activity Log

## Decision 1 — `setGovernanceProfile` is out of scope

The spec's Key Entities are Aspect, Assessment, Checklist Item, Risk, and
Policy. `setGovernanceProfile` (`lib/actions/governance.ts`) writes to the
`Workspace` row itself (company size, jurisdiction) — it isn't one of those
five entity types, so it gets no activity entry. Traced every exported
function in `lib/actions/governance.ts` (22 total) against the five entity
types; the other 21 all map cleanly onto one.

## Decision 2 — One private helper, called from each action's own success path

A single helper, `logGovernanceActivity(client, params)`, inserts one
`GovernanceActivityLogEntry` row. `client` is either `prisma` or the active
`Prisma.TransactionClient` — every action that already runs its mutation
inside `prisma.$transaction(...)` (`generateGovernanceAssessment`,
`deleteGovernanceAspect`, `updatePolicyDraft`, `addGovernancePolicy`) passes
its `tx`, so the log write commits or rolls back atomically with the
mutation it describes. Every other action (the remaining ~18, each already a
single `prisma.x.create/update/delete` call) calls the helper with `prisma`
directly, sequentially after that call succeeds — matching this file's
existing pattern of a plain `await prisma.x.update(...)` followed by
`revalidatePath(...)` with no transaction wrapper. Introducing a `
$transaction` solely to make the log write atomic with an otherwise
single-statement mutation would be defense in depth this file doesn't
apply anywhere else (Constitution Principle VI) — FR-010 ("no entry for a
failed action") is already satisfied because the log write only ever runs
after its mutation's `await` resolves without throwing.

**Alternatives considered**: a generic Prisma middleware/extension that
auto-logs every write to these five tables — rejected as far more complex
than this file's existing patterns for no real benefit: the summary text
needs to be action-specific and hand-written either way ("Renamed to X" vs.
a generic "Updated"), so middleware would still need per-model, per-action
logic bolted on, at which point it is not actually simpler than 21 explicit
calls.

## Decision 3 — `entityId`/`entityLabel` are captured at call time, not read back later

Every action that needs to log already has the row (or its id/title/name)
in hand at its point of mutation — the `create()` result for an add, the
`findUnique()` result already fetched for an update/delete's ownership
check. No second query is needed to build a log entry; the helper is called
with plain strings already sitting in scope.

## Decision 4 — `generateGovernanceAssessment`'s one entry per run

Counted directly from the two arrays the function already builds:
`newItems.length` (checklist items this run will create) and
`newRisks.length` (risks this run will create — every risk in `newRisks`
is created exactly once, either linked to an item inside the main loop or
unlinked in the leftover loop below it, so its length is the true total
regardless of which path each one takes). The summary is built once, after
the transaction, from these two counts and the aspect's name — e.g.
`"Regenerated assessment for 'Risk & Internal Controls' — 3 new checklist
items, 2 new risks"` (or "Generated…" the first time, detected by whether
`existingAssessment` was `null`). If a run finds nothing new (both counts
zero), it still logs one entry ("Regenerated assessment for 'X' — no
changes") rather than silently logging nothing — the *action* of running an
assessment is itself worth a record, independent of whether it found
anything new.

## Decision 5 — Cascade behavior

`GovernanceActivityLogEntry.workspaceId` → `Workspace`, `onDelete: Cascade`
— matches every other workspace-scoped table in this schema; deleting a
workspace deletes its whole audit history with it, same as everything else.
No relation from a log entry to the aspect/assessment/checklist
item/risk/policy it describes (`entityId` is a plain string) — the entire
point is surviving that record's own deletion (FR-009), so a foreign key
back to it would be self-defeating. `actorUserId` → `User` is a normal
required relation; as established in spec 018's research (Decision 2),
`User` rows are never deleted in this app, so its default referential
action is never exercised in practice.

## Decision 6 — Pagination via Prisma cursor, not offset

FR-013 (most-recent-first, no full-history load) needs a "load more" beyond
the page loaded server-side. A new read-only action,
`listGovernanceActivity({ workspaceId, cursor? })`, returns a fixed page
size (50) ordered `createdAt desc, id desc` (the compound order breaks ties
between same-millisecond entries deterministically), using Prisma's
`cursor: { id }, skip: 1` pattern rather than `skip: N` offset pagination —
correct under concurrent inserts (an offset would skip or repeat rows as
new entries land above it), and this schema already indexes
`[workspaceId, createdAt]` for the initial sort. VIEWER-level access, same
as every other governance read.

## Decision 7 — Migration is additive; no hand-authoring needed

One new enum and one new table, both purely additive — same situation as
spec 018 (Decision 7 there): `prisma migrate dev --name governance_activity_log`
generates and applies this cleanly, non-interactively.
