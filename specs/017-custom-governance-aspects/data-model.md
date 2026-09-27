# Data Model: Custom Governance Aspects

## New entity

```prisma
model GovernanceAspect {
  id          String   @id @default(uuid())
  workspaceId String
  name        String

  workspace   Workspace              @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  assessments GovernanceAssessment[]

  createdAt DateTime @default(now())

  @@unique([workspaceId, name])
  @@index([workspaceId])
  @@map("governance_aspects")
}
```

- `name`: the label shown on the tab; unique per workspace (FR-007).
- `createdAt`: also doubles as display order — a new aspect appends after
  the existing ones (FR-002) by simply always ordering `ASC` on this
  column; no separate `order` field needed (no reordering in scope).
- `onDelete: Cascade` from `Workspace`: deleting a whole workspace already
  cascades everything in it; unchanged behavior, just extended to this new
  table.

## Changed entity

`GovernanceAssessment`: `focusArea GovernanceFocusArea` (enum column) →
`aspectId String` (FK):

```prisma
model GovernanceAssessment {
  id          String  @id @default(uuid())
  workspaceId String
  aspectId    String

  summary           String  @db.Text
  summaryHandEdited Boolean @default(false)

  workspace Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  aspect    GovernanceAspect @relation(fields: [aspectId], references: [id], onDelete: Cascade)
  items     GovernanceChecklistItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([aspectId])
  @@map("governance_assessments")
}
```

- `@@unique([aspectId])` replaces today's `@@unique([workspaceId,
  focusArea])` — one assessment per aspect, and an aspect is already
  workspace-scoped, so this is the same guarantee in one column instead of
  two.
- `onDelete: Cascade` on `aspect`: deleting an aspect deletes its own
  assessment (FR-004) — but see research.md Decision 2: the delete action
  must detach linked policy drafts *before* this cascade fires, or their
  own cascade (checklist item → policy) would take policies down with it,
  violating FR-005.

No other entity's shape changes. `GovernanceChecklistItem`,
`GovernanceRisk`, `GovernancePolicyDraft` are structurally untouched —
only what an assessment (and therefore a checklist item, transitively) now
points at has changed.

## Removed

- Prisma enum `GovernanceFocusArea` (dropped once the migration backfills
  `aspectId` and the old `focusArea` column is dropped).
- `lib/domain/governance-focus-areas.ts`'s `GOVERNANCE_FOCUS_AREAS` array,
  `GovernanceFocusAreaValue` type, and `GOVERNANCE_FOCUS_AREA_LABEL` record
  — replaced by real rows.

## Migration

One migration, hand-authored (the data backfill step is not something
`prisma migrate dev` generates on its own):

```sql
-- 1. New table
CREATE TABLE "governance_aspects" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "governance_aspects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "governance_aspects_workspaceId_name_key" ON "governance_aspects"("workspaceId", "name");
CREATE INDEX "governance_aspects_workspaceId_idx" ON "governance_aspects"("workspaceId");
ALTER TABLE "governance_aspects" ADD CONSTRAINT "governance_aspects_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- 2. Seed every workspace's seven built-in aspects, named exactly as
--    GOVERNANCE_FOCUS_AREA_LABEL already labels them today (research.md Decision 3)
INSERT INTO "governance_aspects" ("id", "workspaceId", "name", "createdAt")
SELECT gen_random_uuid(), w."id", f."label", now()
FROM "workspaces" w
CROSS JOIN (VALUES
  ('BOARD_STRUCTURE', 'Board Structure'),
  ('RISK_CONTROLS', 'Risk & Internal Controls'),
  ('ETHICS_POLICY', 'Ethics Policy'),
  ('COMPENSATION', 'Compensation'),
  ('ESG', 'ESG'),
  ('DATA_INTEGRITY', 'Data Integrity'),
  ('ACCESSIBILITY', 'Accessibility')
) AS f("value", "label");

-- 3. Add aspectId, backfill from the existing enum column, then require it
ALTER TABLE "governance_assessments" ADD COLUMN "aspectId" TEXT;
UPDATE "governance_assessments" ga
SET "aspectId" = (
  SELECT gasp."id" FROM "governance_aspects" gasp
  JOIN (VALUES
    ('BOARD_STRUCTURE', 'Board Structure'), ('RISK_CONTROLS', 'Risk & Internal Controls'),
    ('ETHICS_POLICY', 'Ethics Policy'), ('COMPENSATION', 'Compensation'), ('ESG', 'ESG'),
    ('DATA_INTEGRITY', 'Data Integrity'), ('ACCESSIBILITY', 'Accessibility')
  ) AS f("value", "label") ON f."value" = ga."focusArea"::text
  WHERE gasp."workspaceId" = ga."workspaceId" AND gasp."name" = f."label"
);
ALTER TABLE "governance_assessments" ALTER COLUMN "aspectId" SET NOT NULL;
DROP INDEX IF EXISTS "governance_assessments_workspaceId_focusArea_key";
ALTER TABLE "governance_assessments" DROP COLUMN "focusArea";
CREATE UNIQUE INDEX "governance_assessments_aspectId_key" ON "governance_assessments"("aspectId");
ALTER TABLE "governance_assessments" ADD CONSTRAINT "governance_assessments_aspectId_fkey"
  FOREIGN KEY ("aspectId") REFERENCES "governance_aspects"("id") ON DELETE CASCADE;

-- 4. Drop the now-unused enum type
DROP TYPE "GovernanceFocusArea";
```

(Exact index/constraint names above are illustrative — the real migration
uses whatever `prisma migrate dev --create-only` scaffolds for the schema
change, with steps 2–4's data movement hand-inserted into it before
applying.)

## Server action changes (`lib/actions/governance.ts`)

- `generateAssessmentSchema` / `addChecklistItemSchema`: `focusArea:
  z.enum(FOCUS_AREAS)` → `aspectId: z.string().min(1)`. Both actions add an
  ownership lookup (`prisma.governanceAspect.findUnique({ where: { id:
  aspectId } })`, `notFound()` if missing or `aspect.workspaceId !==
  workspaceId`) exactly like every other id-taking action in this file
  already does.
- `buildGovernancePrompt`'s `focusAreaLabel` param is now read from the
  looked-up `aspect.name` instead of a `Record` lookup — same value, new
  source.
- Three new actions:
  - `addGovernanceAspect({ workspaceId, name })` → creates a row; returns a
    validation error naming the duplicate on a unique-constraint conflict
    (FR-007).
  - `renameGovernanceAspect({ workspaceId, aspectId, name })` → ownership
    check, then update `name`; same duplicate handling.
  - `deleteGovernanceAspect({ workspaceId, aspectId })` → ownership check,
    then, in one transaction (research.md Decision 2):
    1. Find the aspect's assessment (if any) and its checklist items.
    2. `governancePolicyDraft.updateMany({ where: { checklistItemId: {
       in: itemIds } }, data: { checklistItemId: null } })` — detach every
       policy before anything cascades.
    3. Delete the assessment (cascades its checklist items; each item's
       risk survives via the already-existing `SetNull`).
    4. Delete the aspect row itself.

## Client data flow

- `page.tsx`: queries `prisma.governanceAspect.findMany({ where: {
  workspaceId }, orderBy: { createdAt: "asc" } })` alongside its existing
  `Promise.all` of workspace data; passes the list to
  `GovernanceAssessmentPanel` as `aspects: { id: string; name: string }[]`
  instead of the removed static import. `focusAreaByAssessmentId` (used to
  label a risk/policy's source) is keyed by `aspectId` now, reading
  `aspect.name` directly rather than through `GOVERNANCE_FOCUS_AREA_LABEL`.
- `governance-assessment-panel.tsx`: `focusArea` state (a fixed enum
  string, defaulting to `"RISK_CONTROLS"`) becomes `aspectId` state,
  defaulting to `aspects[0]?.id`. The tab bar renders from the `aspects`
  prop; each tab gains a small rename/delete affordance (inline, matching
  the existing per-row edit/delete pattern already used for checklist
  items on this same page) plus a "+ Add aspect" control alongside the tab
  bar itself.
- `RiskT.sourceFocusArea` / `PolicyT.focusArea` (added this session, for
  the tab-scoping fix): now carry an aspect *id* rather than an enum value
  — no shape change, just what populates them.
