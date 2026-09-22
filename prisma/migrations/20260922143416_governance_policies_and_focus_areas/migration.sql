-- Two more governance focus areas. Additive: nothing reads a fixed set of
-- five, so existing assessments are untouched.
ALTER TYPE "GovernanceFocusArea" ADD VALUE 'DATA_INTEGRITY';
ALTER TYPE "GovernanceFocusArea" ADD VALUE 'ACCESSIBILITY';

-- A policy can now be written by hand from the Policy Library, with no
-- checklist item behind it — so it needs a workspace of its own rather than
-- one reached through checklistItem -> assessment, and checklistItemId
-- becomes optional.
ALTER TABLE "governance_policy_drafts"
  ADD COLUMN "handManaged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "workspaceId" TEXT,
  ALTER COLUMN "checklistItemId" DROP NOT NULL;

-- Every existing policy reached its workspace through its checklist item, so
-- that is where the backfill reads it from. Prisma's generated SQL added the
-- column NOT NULL in one step, which fails outright on any database that has
-- policies in it.
UPDATE "governance_policy_drafts" AS p
SET "workspaceId" = a."workspaceId"
FROM "governance_checklist_items" AS i
JOIN "governance_assessments" AS a ON a."id" = i."assessmentId"
WHERE i."id" = p."checklistItemId";

ALTER TABLE "governance_policy_drafts" ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "governance_policy_drafts_workspaceId_idx" ON "governance_policy_drafts"("workspaceId");

-- AddForeignKey
ALTER TABLE "governance_policy_drafts" ADD CONSTRAINT "governance_policy_drafts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
