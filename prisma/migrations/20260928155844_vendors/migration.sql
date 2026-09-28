-- CreateEnum
CREATE TYPE "VendorCriticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DueDiligenceStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "criticality" "VendorCriticality" NOT NULL,
    "ownerRoleId" TEXT,
    "ownerPersonId" TEXT,
    "dueDiligenceStatus" "DueDiligenceStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "lastDueDiligenceOn" TIMESTAMP(3),
    "reviewCycleMonths" INTEGER,
    "contractStartOn" TIMESTAMP(3),
    "contractEndOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_risks" (
    "vendorId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,

    CONSTRAINT "vendor_risks_pkey" PRIMARY KEY ("vendorId","riskId")
);

-- CreateIndex
CREATE INDEX "vendors_workspaceId_idx" ON "vendors"("workspaceId");

-- CreateIndex
CREATE INDEX "vendor_risks_riskId_idx" ON "vendor_risks"("riskId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_ownerRoleId_fkey" FOREIGN KEY ("ownerRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_risks" ADD CONSTRAINT "vendor_risks_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_risks" ADD CONSTRAINT "vendor_risks_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "governance_risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
