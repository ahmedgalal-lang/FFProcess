-- CreateEnum
CREATE TYPE "LawfulBasis" AS ENUM ('CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'VITAL_INTERESTS', 'PUBLIC_TASK', 'LEGITIMATE_INTERESTS');

-- CreateEnum
CREATE TYPE "DpiaStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "DpiaResidualRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "processing_activities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "lawfulBasis" "LawfulBasis" NOT NULL,
    "dataSubjectCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "personalDataCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retentionPeriod" TEXT NOT NULL,
    "specialCategory" BOOLEAN NOT NULL DEFAULT false,
    "transferDestination" TEXT,
    "transferSafeguard" TEXT,
    "processId" TEXT,
    "ownerRoleId" TEXT,
    "ownerPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dpias" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "risksIdentified" TEXT NOT NULL,
    "mitigations" TEXT NOT NULL,
    "residualRisk" "DpiaResidualRisk" NOT NULL,
    "status" "DpiaStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dpias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_breach_links" (
    "activityId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,

    CONSTRAINT "processing_breach_links_pkey" PRIMARY KEY ("activityId","incidentId")
);

-- CreateIndex
CREATE INDEX "processing_activities_workspaceId_idx" ON "processing_activities"("workspaceId");

-- CreateIndex
CREATE INDEX "dpias_activityId_idx" ON "dpias"("activityId");

-- CreateIndex
CREATE INDEX "processing_breach_links_incidentId_idx" ON "processing_breach_links"("incidentId");

-- AddForeignKey
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_ownerRoleId_fkey" FOREIGN KEY ("ownerRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dpias" ADD CONSTRAINT "dpias_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "processing_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dpias" ADD CONSTRAINT "dpias_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_breach_links" ADD CONSTRAINT "processing_breach_links_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "processing_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_breach_links" ADD CONSTRAINT "processing_breach_links_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "governance_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
