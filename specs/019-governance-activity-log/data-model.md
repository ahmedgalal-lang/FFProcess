# Data Model: Governance Activity Log

## New enum

```prisma
enum GovernanceActivityEntityType {
  ASPECT
  ASSESSMENT
  CHECKLIST_ITEM
  RISK
  POLICY
}
```

## New entity

```prisma
model GovernanceActivityLogEntry {
  id          String                       @id @default(uuid())
  workspaceId String
  entityType  GovernanceActivityEntityType
  /// Deliberately not a relation — see research.md Decision 5. Survives the
  /// described record's own deletion.
  entityId    String
  /// The record's name/title as of this action — a rename's own entry keeps
  /// the *old* label (what was true when the action happened), a later
  /// entry about the same entityId carries the new one.
  entityLabel String
  /// Short, human-written, action-specific — see the call-site table below.
  summary     String
  actorUserId String

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  actor     User      @relation(fields: [actorUserId], references: [id])

  createdAt DateTime @default(now())

  @@index([workspaceId, createdAt])
  @@map("governance_activity_log_entries")
}
```

## Changed entities (back-relations only)

```prisma
model Workspace {
  // ...existing fields unchanged...
  governanceActivityLog GovernanceActivityLogEntry[]
}

model User {
  // ...existing fields unchanged (already gained two from spec 018)...
  governanceActivityLogEntries GovernanceActivityLogEntry[]
}
```

## No changes

`GovernanceAspect`, `GovernanceAssessment`, `GovernanceChecklistItem`,
`GovernanceRisk`, `GovernancePolicyDraft`, `GovernancePolicyVersion`,
`GovernancePolicyAcknowledgement` are structurally untouched — this feature
only adds a new, independent table that references them by plain id, not a
relation.

## Migration

Purely additive (research.md Decision 7) — generated and applied by
`prisma migrate dev --name governance_activity_log` directly, no
hand-authored SQL: `CREATE TYPE "GovernanceActivityEntityType" AS ENUM
(...)`, `CREATE TABLE "governance_activity_log_entries" (...)` with its FKs
to `workspaces` and `users`, and its `("workspaceId", "createdAt")` index.

## Server action changes (`lib/actions/governance.ts`)

New private helper:

```ts
async function logGovernanceActivity(
  client: Prisma.TransactionClient | typeof prisma,
  params: {
    workspaceId: string;
    entityType: GovernanceActivityEntityType;
    entityId: string;
    entityLabel: string;
    summary: string;
    actorUserId: string;
  }
) {
  await client.governanceActivityLogEntry.create({ data: params });
}
```

New public read action (VIEWER-level, cursor-paginated — research.md
Decision 6):

```ts
const PAGE_SIZE = 50;
export async function listGovernanceActivity(input: {
  workspaceId: string;
  cursor?: string;
}): Promise<ActionResult<{ entries: ...[]; nextCursor: string | null }>>
```

Every mutating action's success path gains one `logGovernanceActivity`
call, using its transaction's `tx` where one already exists (research.md
Decision 2). Call-site summary pattern (User Story column shows which
phase wires it):

| Action | entityType | Summary pattern | Story |
|---|---|---|---|
| `addGovernanceAspect` | ASPECT | `"Added"` | US1 |
| `renameGovernanceAspect` | ASPECT | `"Renamed from 'X' to 'Y'"` | US1 |
| `deleteGovernanceAspect` | ASPECT | `"Deleted"` | US1 |
| `addGovernanceRisk` | RISK | `"Added"` | US1 |
| `updateGovernanceRisk` | RISK | `"Updated"` (names the changed field(s) when exactly one changed, e.g. `"Status changed to Accepted"`) | US1 |
| `deleteGovernanceRisk` | RISK | `"Deleted"` | US1 |
| `addGovernanceChecklistItem` | CHECKLIST_ITEM | `"Added"` | US2 |
| `updateGovernanceChecklistItem` | CHECKLIST_ITEM | `"Edited"` | US2 |
| `deleteGovernanceChecklistItem` | CHECKLIST_ITEM | `"Deleted"` | US2 |
| `setChecklistItemStatus` | CHECKLIST_ITEM | `"Marked <status>"` | US2 |
| `updateGovernanceSummary` | ASSESSMENT | `"Executive summary edited"` | US2 |
| `generateGovernanceAssessment` | ASSESSMENT | `"Generated/Regenerated assessment — N new checklist item(s), M new risk(s)"` (research.md Decision 4) | US2 |
| `addGovernancePolicy` | POLICY | `"Added"` | US3 |
| `updatePolicyDraft` | POLICY | `"Edited"` | US3 |
| `deleteGovernancePolicy` | POLICY | `"Deleted"` | US3 |
| `submitPolicyForReview` | POLICY | `"Submitted for review"` | US3 |
| `approvePolicyDraft` | POLICY | `"Approved"` | US3 |
| `publishPolicyDraft` | POLICY | `"Published"` | US3 |
| `retirePolicyDraft` | POLICY | `"Retired"` | US3 |
| `setPolicyReviewDueDate` | POLICY | `"Review-due date set to <date>"` / `"Review-due date cleared"` | US3 |
| `markPolicyAcknowledgement` | POLICY | `"Acknowledgement marked for <person name>"` | US3 |
| `unmarkPolicyAcknowledgement` | POLICY | `"Acknowledgement unmarked for <person name>"` | US3 |

`setGovernanceProfile` is excluded (research.md Decision 1).

## Client data flow

- New component, `governance-activity-log.tsx` — a section on the
  Governance page. `page.tsx` loads the first page (50 entries, newest
  first, joined with `actor.name`/`actor.email` and, for a `POLICY` entry,
  nothing further — the label was already captured at write time) and
  passes it down; the component renders each entry (who, summary, an
  entity-type badge, a relative/absolute timestamp) and offers a "Load
  more" button that calls `listGovernanceActivity` client-side, appending
  the next page.
- No changes to any existing component's props beyond `page.tsx` adding one
  new section and one new query.
