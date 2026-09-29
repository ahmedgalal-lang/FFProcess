-- AlterTable
ALTER TABLE "governance_policy_drafts" ADD COLUMN     "governsAspectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "governance_policy_drafts_governsAspectId_key" ON "governance_policy_drafts"("governsAspectId");

-- AddForeignKey
ALTER TABLE "governance_policy_drafts" ADD CONSTRAINT "governance_policy_drafts_governsAspectId_fkey" FOREIGN KEY ("governsAspectId") REFERENCES "governance_aspects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

