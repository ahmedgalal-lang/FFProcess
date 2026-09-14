-- Authority Rule Builder (spec 004)
--
-- Turns the Authority Matrix's one-row-per-task shape into an ordered list of
-- rules per task. See specs/004-authority-rule-builder/data-model.md.
--
-- Statement order matters and is not the order `prisma migrate diff` emits:
-- the new table has to exist and be filled before the old columns are dropped,
-- or the backfill has nothing to read.

-- CreateEnum
CREATE TYPE "AuthorityMeasure" AS ENUM ('MONEY', 'TIME', 'NONE');

-- CreateEnum
CREATE TYPE "AuthorityConsequence" AS ENUM ('APPROVAL', 'ESCALATION');

-- CreateTable
CREATE TABLE "authority_rules" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "measure" "AuthorityMeasure" NOT NULL DEFAULT 'MONEY',
    "amount" DECIMAL(14,2),
    "days" INTEGER,
    "direction" "AuthorityDirection" NOT NULL DEFAULT 'GREATER_THAN',
    "consequence" "AuthorityConsequence" NOT NULL DEFAULT 'APPROVAL',
    "whoRoleId" TEXT,
    "whoPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authority_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "authority_rules_assignmentId_order_idx" ON "authority_rules"("assignmentId", "order");

-- AddForeignKey
ALTER TABLE "authority_rules" ADD CONSTRAINT "authority_rules_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "authority_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_rules" ADD CONSTRAINT "authority_rules_whoRoleId_fkey" FOREIGN KEY ("whoRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_rules" ADD CONSTRAINT "authority_rules_whoPersonId_fkey" FOREIGN KEY ("whoPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: every existing assignment becomes one or more rules.
--
-- In the same migration as the schema change, deliberately: a separate
-- migration would leave a window where authority_rules exists and is empty,
-- and an Authority Matrix that renders empty is indistinguishable from one a
-- consultant never filled in.
--
-- FR-015 is the rule being honoured here — no recorded threshold, direction,
-- turnaround, approver, co-approver or escalation owner may be lost. The old
-- columns are dropped only after this has run.
-- ---------------------------------------------------------------------------

-- Rule 0 — the task's own approval gate.
-- A task recorded as needing no approval becomes a NONE rule, which is what
-- keeps its row rendering dimmed. Otherwise anything that carried a threshold
-- or an approver becomes a MONEY approval rule; an approver recorded without a
-- threshold keeps the approver and leaves the figure blank, which validation
-- then reports as unfinished rather than this migration inventing a number.
INSERT INTO "authority_rules" ("id", "assignmentId", "order", "measure", "amount", "days", "direction", "consequence", "whoRoleId", "whoPersonId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, a."id", 0,
       CASE WHEN a."direction" = 'EQUAL_NO_APPROVAL' THEN 'NONE'::"AuthorityMeasure" ELSE 'MONEY'::"AuthorityMeasure" END,
       CASE WHEN a."direction" = 'EQUAL_NO_APPROVAL' THEN NULL ELSE a."threshold" END,
       NULL,
       a."direction",
       'APPROVAL'::"AuthorityConsequence",
       CASE WHEN a."direction" = 'EQUAL_NO_APPROVAL' THEN NULL ELSE a."approverRoleId" END,
       CASE WHEN a."direction" = 'EQUAL_NO_APPROVAL' THEN NULL ELSE a."approverPersonId" END,
       a."createdAt", now()
FROM "authority_assignments" a
WHERE a."direction" = 'EQUAL_NO_APPROVAL'
   OR a."threshold" IS NOT NULL
   OR a."approverRoleId" IS NOT NULL
   OR a."approverPersonId" IS NOT NULL;

-- Rule 1 — the co-approver, now an ordinary second signer.
-- This is the change the user asked for: a second approval rule rather than a
-- special-purpose column.
INSERT INTO "authority_rules" ("id", "assignmentId", "order", "measure", "amount", "days", "direction", "consequence", "whoRoleId", "whoPersonId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, a."id", 1,
       'MONEY'::"AuthorityMeasure", a."coApprovalAboveThreshold", NULL,
       'GREATER_THAN'::"AuthorityDirection", 'APPROVAL'::"AuthorityConsequence",
       a."coApproverRoleId", NULL, a."createdAt", now()
FROM "authority_assignments" a
WHERE a."coApprovalAboveThreshold" IS NOT NULL;

-- Rule 2 — the turnaround, now a time rule that escalates.
-- Applies even to a task recorded as needing no approval: such a task could
-- still carry a turnaround expectation, and the old rule sentence printed it
-- ("No approval required ... Turnaround expectation: within 3 days"), so it is
-- a recorded value and dropping it would breach FR-015.
INSERT INTO "authority_rules" ("id", "assignmentId", "order", "measure", "amount", "days", "direction", "consequence", "whoRoleId", "whoPersonId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, a."id", 2,
       'TIME'::"AuthorityMeasure", NULL, a."slaDays",
       'GREATER_THAN'::"AuthorityDirection", 'ESCALATION'::"AuthorityConsequence",
       a."escalationRoleId", NULL, a."createdAt", now()
FROM "authority_assignments" a
WHERE a."slaDays" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Only now that every value has been copied across do the old columns go.
-- Re-running this migration is a no-op: once these are gone there is nothing
-- left for the backfill to read.
-- ---------------------------------------------------------------------------

-- DropForeignKey
ALTER TABLE "authority_assignments" DROP CONSTRAINT "authority_assignments_approverPersonId_fkey";

-- DropForeignKey
ALTER TABLE "authority_assignments" DROP CONSTRAINT "authority_assignments_approverRoleId_fkey";

-- DropForeignKey
ALTER TABLE "authority_assignments" DROP CONSTRAINT "authority_assignments_coApproverRoleId_fkey";

-- DropForeignKey
ALTER TABLE "authority_assignments" DROP CONSTRAINT "authority_assignments_escalationRoleId_fkey";

-- AlterTable
ALTER TABLE "authority_assignments" DROP COLUMN "approverPersonId",
DROP COLUMN "approverRoleId",
DROP COLUMN "coApprovalAboveThreshold",
DROP COLUMN "coApproverRoleId",
DROP COLUMN "direction",
DROP COLUMN "escalationRoleId",
DROP COLUMN "slaDays",
DROP COLUMN "threshold";
