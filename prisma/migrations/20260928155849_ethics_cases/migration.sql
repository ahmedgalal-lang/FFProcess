-- CreateEnum
CREATE TYPE "EthicsChannel" AS ENUM ('HOTLINE', 'EMAIL', 'IN_PERSON', 'MANAGER_REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "EthicsCategory" AS ENUM ('FRAUD', 'BRIBERY_CORRUPTION', 'HARASSMENT_DISCRIMINATION', 'HEALTH_SAFETY', 'CONFLICT_OF_INTEREST', 'DATA_MISUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "EthicsSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EthicsStatus" AS ENUM ('NEW', 'TRIAGED', 'UNDER_INVESTIGATION', 'CLOSED');

-- CreateEnum
CREATE TYPE "EthicsOutcome" AS ENUM ('SUBSTANTIATED', 'PARTIALLY_SUBSTANTIATED', 'UNSUBSTANTIATED', 'REFERRED');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "nextEthicsCaseNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ethics_cases" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "receivedOn" TIMESTAMP(3) NOT NULL,
    "channel" "EthicsChannel" NOT NULL,
    "category" "EthicsCategory" NOT NULL,
    "severity" "EthicsSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL,
    "reporterName" TEXT,
    "status" "EthicsStatus" NOT NULL DEFAULT 'NEW',
    "investigatorPersonId" TEXT,
    "investigatorName" TEXT,
    "outcome" "EthicsOutcome",
    "closingSummary" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ethics_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ethics_case_notes" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ethics_case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ethics_cases_workspaceId_number_key" ON "ethics_cases"("workspaceId", "number");

-- CreateIndex
CREATE INDEX "ethics_case_notes_caseId_idx" ON "ethics_case_notes"("caseId");

-- AddForeignKey
ALTER TABLE "ethics_cases" ADD CONSTRAINT "ethics_cases_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ethics_cases" ADD CONSTRAINT "ethics_cases_investigatorPersonId_fkey" FOREIGN KEY ("investigatorPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ethics_case_notes" ADD CONSTRAINT "ethics_case_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ethics_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ethics_case_notes" ADD CONSTRAINT "ethics_case_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
