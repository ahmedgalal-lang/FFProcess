-- CreateEnum
CREATE TYPE "RiskTreatmentStrategy" AS ENUM ('MITIGATE', 'TRANSFER', 'ACCEPT', 'AVOID');

-- AlterTable
ALTER TABLE "governance_risks" ADD COLUMN     "targetImpact" "RiskImpact",
ADD COLUMN     "targetLikelihood" "RiskLikelihood",
ADD COLUMN     "treatmentRationale" TEXT,
ADD COLUMN     "treatmentStrategy" "RiskTreatmentStrategy";

-- CreateTable
CREATE TABLE "governance_risk_treatment_actions" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerRoleId" TEXT,
    "ownerPersonId" TEXT,
    "dueDate" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_risk_treatment_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_risk_treatment_actions_riskId_idx" ON "governance_risk_treatment_actions"("riskId");

-- AddForeignKey
ALTER TABLE "governance_risk_treatment_actions" ADD CONSTRAINT "governance_risk_treatment_actions_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "governance_risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_risk_treatment_actions" ADD CONSTRAINT "governance_risk_treatment_actions_ownerRoleId_fkey" FOREIGN KEY ("ownerRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_risk_treatment_actions" ADD CONSTRAINT "governance_risk_treatment_actions_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
