-- CreateEnum
CREATE TYPE "GovernanceFocusArea" AS ENUM ('BOARD_STRUCTURE', 'RISK_CONTROLS', 'ETHICS_POLICY', 'COMPENSATION', 'ESG');

-- CreateEnum
CREATE TYPE "GovernanceItemPhase" AS ENUM ('IMMEDIATE', 'NEAR_TERM', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "GovernanceItemStatus" AS ENUM ('OPEN', 'EDITED', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RiskLikelihood" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RiskImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MITIGATING', 'ACCEPTED', 'CLOSED');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "governanceCompanySize" TEXT,
ADD COLUMN     "governanceJurisdiction" TEXT;

-- CreateTable
CREATE TABLE "governance_assessments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "focusArea" "GovernanceFocusArea" NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_checklist_items" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "phase" "GovernanceItemPhase" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "GovernanceItemStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_policy_drafts" (
    "id" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "GovernanceItemStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_policy_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_risks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "likelihood" "RiskLikelihood" NOT NULL,
    "impact" "RiskImpact" NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "handManaged" BOOLEAN NOT NULL DEFAULT false,
    "ownerRoleId" TEXT,
    "ownerPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_risks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "governance_assessments_workspaceId_focusArea_key" ON "governance_assessments"("workspaceId", "focusArea");

-- CreateIndex
CREATE INDEX "governance_checklist_items_assessmentId_idx" ON "governance_checklist_items"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "governance_policy_drafts_checklistItemId_key" ON "governance_policy_drafts"("checklistItemId");

-- CreateIndex
CREATE INDEX "governance_risks_workspaceId_idx" ON "governance_risks"("workspaceId");

-- AddForeignKey
ALTER TABLE "governance_assessments" ADD CONSTRAINT "governance_assessments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_checklist_items" ADD CONSTRAINT "governance_checklist_items_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "governance_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_policy_drafts" ADD CONSTRAINT "governance_policy_drafts_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "governance_checklist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_risks" ADD CONSTRAINT "governance_risks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_risks" ADD CONSTRAINT "governance_risks_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "governance_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_risks" ADD CONSTRAINT "governance_risks_ownerRoleId_fkey" FOREIGN KEY ("ownerRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_risks" ADD CONSTRAINT "governance_risks_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
