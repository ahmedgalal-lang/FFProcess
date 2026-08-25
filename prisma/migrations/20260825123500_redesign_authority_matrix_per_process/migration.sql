-- CreateEnum
CREATE TYPE "AuthorityUnit" AS ENUM ('MONEY', 'DAYS');

-- DropForeignKey
ALTER TABLE "approval_rules" DROP CONSTRAINT "approval_rules_approverPersonId_fkey";

-- DropForeignKey
ALTER TABLE "approval_rules" DROP CONSTRAINT "approval_rules_approverRoleId_fkey";

-- DropForeignKey
ALTER TABLE "approval_rules" DROP CONSTRAINT "approval_rules_coApprovalRoleId_fkey";

-- DropForeignKey
ALTER TABLE "approval_rules" DROP CONSTRAINT "approval_rules_decisionTypeId_fkey";

-- DropForeignKey
ALTER TABLE "decision_types" DROP CONSTRAINT "decision_types_workspaceId_fkey";

-- DropTable
DROP TABLE "approval_rules";

-- DropTable
DROP TABLE "decision_types";

-- CreateTable
CREATE TABLE "authority_assignments" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "activityId" TEXT,
    "stepId" TEXT,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "unit" "AuthorityUnit" NOT NULL DEFAULT 'MONEY',
    "threshold" DECIMAL(14,2),
    "approverRoleId" TEXT,
    "approverPersonId" TEXT,
    "coApprovalAboveThreshold" DECIMAL(14,2),
    "coApprovalRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authority_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "authority_assignments_activityId_key" ON "authority_assignments"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "authority_assignments_stepId_key" ON "authority_assignments"("stepId");

-- CreateIndex
CREATE INDEX "authority_assignments_processId_idx" ON "authority_assignments"("processId");

-- AddForeignKey
ALTER TABLE "authority_assignments" ADD CONSTRAINT "authority_assignments_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_assignments" ADD CONSTRAINT "authority_assignments_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_assignments" ADD CONSTRAINT "authority_assignments_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "process_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_assignments" ADD CONSTRAINT "authority_assignments_approverRoleId_fkey" FOREIGN KEY ("approverRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_assignments" ADD CONSTRAINT "authority_assignments_approverPersonId_fkey" FOREIGN KEY ("approverPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_assignments" ADD CONSTRAINT "authority_assignments_coApprovalRoleId_fkey" FOREIGN KEY ("coApprovalRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

