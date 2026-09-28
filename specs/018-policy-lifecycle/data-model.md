# Data Model: Policy Lifecycle

## New enum

```prisma
enum GovernancePolicyLifecycleStatus {
  DRAFT
  IN_REVIEW
  APPROVED
  PUBLISHED
  RETIRED
}
```

Independent of the existing `GovernanceItemStatus` (`status` field) — see
research.md Decision 1.

## Changed entity: `GovernancePolicyDraft`

```prisma
model GovernancePolicyDraft {
  id              String               @id @default(uuid())
  workspaceId     String
  checklistItemId String?              @unique
  title           String
  body            String               @db.Text
  status          GovernanceItemStatus @default(OPEN)
  handManaged     Boolean              @default(false)

  // New for spec 018 — independent of `status` above.
  lifecycleStatus GovernancePolicyLifecycleStatus @default(DRAFT)
  approvedByUserId String?
  approvedAt       DateTime?
  effectiveDate    DateTime?
  reviewDueDate    DateTime?

  workspace       Workspace                     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  checklistItem   GovernanceChecklistItem?       @relation(fields: [checklistItemId], references: [id], onDelete: Cascade)
  approvedByUser  User?                          @relation(fields: [approvedByUserId], references: [id])
  versions        GovernancePolicyVersion[]
  acknowledgements GovernancePolicyAcknowledgement[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([workspaceId])
  @@map("governance_policy_drafts")
}
```

- `lifecycleStatus` defaults to `DRAFT` — every existing policy row lands
  there on migration, matching FR-002 (every policy starts in Draft) and
  requiring no backfill decision (existing rows simply get the default).
- `approvedByUserId` / `approvedAt`: set together, only by the approve
  action (FR-004); both `null` until then. `onDelete` left at Prisma's
  default for an optional relation (`SET NULL`) — never actually exercised
  (research.md Decision 2).
- `effectiveDate`: set by the publish action (FR-005), defaulting to "today"
  at the point of publishing — the default is applied in the action, not the
  schema, since "today" has no fixed schema-level default.
- `reviewDueDate`: settable independent of lifecycle status (FR-011) — no
  default, `null` means "no review date set."

## New entity: `GovernancePolicyVersion`

```prisma
model GovernancePolicyVersion {
  id            String   @id @default(uuid())
  policyId      String
  versionNumber Int
  title         String
  body          String   @db.Text
  createdByUserId String

  policy         GovernancePolicyDraft @relation(fields: [policyId], references: [id], onDelete: Cascade)
  createdByUser  User                  @relation(fields: [createdByUserId], references: [id])

  createdAt DateTime @default(now())

  @@unique([policyId, versionNumber])
  @@index([policyId])
  @@map("governance_policy_versions")
}
```

- `versionNumber`: sequential per policy, starting at 1, assigned by the
  server action (`count of existing versions for this policy + 1`) inside
  the same transaction as the insert — not a database identity/sequence, so
  it stays contiguous even though rows are per-policy, not global.
- One row is created in the same transaction as the policy itself
  (`versionNumber: 1`), so a policy never has zero versions (research.md
  Decision 4).
- `onDelete: Cascade` from the policy: deleting a policy deletes its version
  history (research.md Decision 5).

## New entity: `GovernancePolicyAcknowledgement`

```prisma
model GovernancePolicyAcknowledgement {
  id       String @id @default(uuid())
  policyId String
  personId String

  policy GovernancePolicyDraft @relation(fields: [policyId], references: [id], onDelete: Cascade)
  person Person                @relation(fields: [personId], references: [id], onDelete: Cascade)

  acknowledgedAt DateTime @default(now())

  @@unique([policyId, personId])
  @@index([policyId])
  @@map("governance_policy_acknowledgements")
}
```

- `@@unique([policyId, personId])`: one acknowledgement per person per
  policy — marking again just no-ops against the existing row (or the
  action can treat a repeat mark as idempotent); unmarking deletes the row.
- Both relations `onDelete: Cascade` — deleting the policy or removing the
  person from the workspace's directory removes the acknowledgement with it
  (spec.md Edge Cases; research.md Decision 5).

## Changed entity: `User` (back-relations only)

```prisma
model User {
  // ...existing fields unchanged...

  policyVersionsAuthored GovernancePolicyVersion[]
  policiesApproved       GovernancePolicyDraft[]
}
```

No new scalar fields on `User` — only the two back-relation arrays Prisma
requires for the new foreign keys above.

## Changed entity: `Person` (back-relation only)

```prisma
model Person {
  // ...existing fields unchanged...

  policyAcknowledgements GovernancePolicyAcknowledgement[]
}
```

## No changes

`GovernanceAspect`, `GovernanceAssessment`, `GovernanceChecklistItem`,
`GovernanceRisk`, and every non-governance model are structurally untouched.
`GovernanceItemStatus`'s existing four values and every place that already
reads/writes `status` on a policy are unchanged (FR-018).

## Migration

Purely additive — generated and applied by `prisma migrate dev --name
policy_lifecycle` directly (research.md Decision 7), no hand-authored SQL:

1. `CREATE TYPE "GovernancePolicyLifecycleStatus" AS ENUM (...)`.
2. `ALTER TABLE "governance_policy_drafts" ADD COLUMN "lifecycleStatus" ... DEFAULT 'DRAFT', ADD COLUMN "approvedByUserId" TEXT, ADD COLUMN "approvedAt" TIMESTAMP(3), ADD COLUMN "effectiveDate" TIMESTAMP(3), ADD COLUMN "reviewDueDate" TIMESTAMP(3)`, plus the new FK constraint to `users`.
3. `CREATE TABLE "governance_policy_versions" (...)` with its FKs to `governance_policy_drafts` and `users`, and its unique index on `("policyId", "versionNumber")`.
4. `CREATE TABLE "governance_policy_acknowledgements" (...)` with its FKs to `governance_policy_drafts` and `people`, and its unique index on `("policyId", "personId")`.

(Exact column/constraint names are whatever `prisma migrate dev` scaffolds
from the schema change above — no manual editing needed, unlike spec 017.)

## Server action changes (`lib/actions/governance.ts`)

- `updatePolicyDraft`: after the existing update, also (same transaction):
  - insert a `GovernancePolicyVersion` (`versionNumber` = current max + 1,
    the saved `title`/`body`, `createdByUserId` = `access.data.userId`);
  - if the policy's `lifecycleStatus` was `APPROVED` or `PUBLISHED`, reset it
    to `DRAFT` (FR-008) and clear `approvedByUserId`/`approvedAt` (an
    approval that no longer matches the current content is not an approval
    of anything).
- `addGovernancePolicy`: after creating the policy, insert its first
  `GovernancePolicyVersion` (`versionNumber: 1`) in the same transaction.
- `generateGovernanceAssessment`'s existing policy-creation step (inside its
  transaction, for a newly-drafted policy): also insert `versionNumber: 1`,
  attributed to... there is no human actor for an AI-generated draft; use
  the *regenerating* user's id (`access.data.userId`) as the version's
  author, since they are the one who triggered its creation — same
  attribution `updateGovernanceSummary` already gives a hand-edited summary
  when the person who ran the regenerate is the only "who" available.
- Five new actions, all ownership-checked (`policy.workspaceId ===
  workspaceId`, `notFound()` otherwise) and rejecting the wrong starting
  `lifecycleStatus` with a validation error naming the actual one (FR-007):
  - `submitPolicyForReview({ workspaceId, policyId })` — EDITOR; DRAFT → IN_REVIEW.
  - `approvePolicyDraft({ workspaceId, policyId })` — ADMIN; IN_REVIEW → APPROVED, sets `approvedByUserId`/`approvedAt`.
  - `publishPolicyDraft({ workspaceId, policyId, effectiveDate? })` — ADMIN; APPROVED → PUBLISHED, sets `effectiveDate` (input or today).
  - `retirePolicyDraft({ workspaceId, policyId })` — ADMIN; PUBLISHED → RETIRED.
  - `setPolicyReviewDueDate({ workspaceId, policyId, reviewDueDate: string | null })` — EDITOR; sets or clears `reviewDueDate`, independent of `lifecycleStatus`.
- Two new actions for acknowledgement (FR-013):
  - `markPolicyAcknowledgement({ workspaceId, policyId, personId })` — EDITOR; upserts a `GovernancePolicyAcknowledgement` row; rejected with a validation error if the policy has never been Published (`lifecycleStatus` is DRAFT/IN_REVIEW/APPROVED).
  - `unmarkPolicyAcknowledgement({ workspaceId, policyId, personId })` — EDITOR; deletes the row if present (no-op if not).
- New read helper (or inline query in `page.tsx`): fetch a policy's
  `versions` (ordered by `versionNumber` desc) and `acknowledgements`
  (joined with `Person.name`) when the drawer needs them.

## Client data flow

- `PolicyT` (`governance-policy-drawer.tsx`) gains: `lifecycleStatus`,
  `approvedByUserName: string | null`, `approvedAt: string | null`,
  `effectiveDate: string | null`, `reviewDueDate: string | null`,
  `needsReview: boolean` (computed server-side in `page.tsx`:
  `lifecycleStatus === "PUBLISHED" && reviewDueDate !== null &&
  reviewDueDate < today`).
- `governance-policy-library.tsx`: each row gains a second badge for
  `lifecycleStatus` (alongside the existing recommendation-status badge) and
  a small "Needs review" flag when `needsReview` is true.
- `governance-policy-drawer.tsx`: gains a lifecycle status badge, the
  Submit/Approve/Publish/Retire action buttons (each shown only when the
  viewer's access level and the policy's current `lifecycleStatus` both
  allow it — mirrors the aspect-toolbar pattern from spec 017, one
  contextual action shown at a time, not a full state-machine diagram), a
  review-due date field, an expandable version-history list, and — once
  Published or Retired — the acknowledgement checklist against the
  workspace's People directory (passed down from `page.tsx`, which already
  loads `people` for RACI/Authority).
