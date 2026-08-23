-- CreateEnum
CREATE TYPE "ReviewFindingCategory" AS ENUM ('GAP', 'RISK');

-- CreateEnum
CREATE TYPE "ReviewFindingArea" AS ENUM ('PROCESS_MAP', 'RACI', 'AUTHORITY', 'GENERAL');

-- CreateEnum
CREATE TYPE "ReviewFindingSeverity" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ReviewFindingStatus" AS ENUM ('OPEN', 'EDITED', 'INTEGRATED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReviewFindingIntegrationMode" AS ENUM ('MERGED', 'REPLACED');

-- AlterTable
ALTER TABLE "process_steps" ADD COLUMN     "reviewNotes" TEXT;

-- CreateTable
CREATE TABLE "review_findings" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "category" "ReviewFindingCategory" NOT NULL,
    "area" "ReviewFindingArea" NOT NULL,
    "severity" "ReviewFindingSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "status" "ReviewFindingStatus" NOT NULL DEFAULT 'OPEN',
    "integratedStepId" TEXT,
    "integrationMode" "ReviewFindingIntegrationMode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_findings_processId_idx" ON "review_findings"("processId");

-- AddForeignKey
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_integratedStepId_fkey" FOREIGN KEY ("integratedStepId") REFERENCES "process_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
