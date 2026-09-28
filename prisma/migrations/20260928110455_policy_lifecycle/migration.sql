-- CreateEnum
CREATE TYPE "GovernancePolicyLifecycleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED');

-- AlterTable
ALTER TABLE "governance_policy_drafts" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "effectiveDate" TIMESTAMP(3),
ADD COLUMN     "lifecycleStatus" "GovernancePolicyLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "reviewDueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "governance_policy_versions" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_policy_acknowledgements" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_policy_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_policy_versions_policyId_idx" ON "governance_policy_versions"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "governance_policy_versions_policyId_versionNumber_key" ON "governance_policy_versions"("policyId", "versionNumber");

-- CreateIndex
CREATE INDEX "governance_policy_acknowledgements_policyId_idx" ON "governance_policy_acknowledgements"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "governance_policy_acknowledgements_policyId_personId_key" ON "governance_policy_acknowledgements"("policyId", "personId");

-- AddForeignKey
ALTER TABLE "governance_policy_drafts" ADD CONSTRAINT "governance_policy_drafts_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_policy_versions" ADD CONSTRAINT "governance_policy_versions_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "governance_policy_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_policy_versions" ADD CONSTRAINT "governance_policy_versions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_policy_acknowledgements" ADD CONSTRAINT "governance_policy_acknowledgements_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "governance_policy_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_policy_acknowledgements" ADD CONSTRAINT "governance_policy_acknowledgements_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
