-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('OPERATIONAL', 'FINANCIAL', 'IT_SECURITY', 'HEALTH_SAFETY', 'COMPLIANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "governance_incidents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "rootCause" TEXT,
    "closedAt" TIMESTAMP(3),
    "processId" TEXT,
    "personalDataBreach" BOOLEAN NOT NULL DEFAULT false,
    "breachAwareAt" TIMESTAMP(3),
    "regulatorNotifiedAt" TIMESTAMP(3),
    "notificationNotRequiredReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_incident_actions" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerRoleId" TEXT,
    "ownerPersonId" TEXT,
    "dueDate" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_incident_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_incident_risks" (
    "incidentId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,

    CONSTRAINT "governance_incident_risks_pkey" PRIMARY KEY ("incidentId","riskId")
);

-- CreateIndex
CREATE INDEX "governance_incidents_workspaceId_idx" ON "governance_incidents"("workspaceId");

-- CreateIndex
CREATE INDEX "governance_incident_actions_incidentId_idx" ON "governance_incident_actions"("incidentId");

-- CreateIndex
CREATE INDEX "governance_incident_risks_riskId_idx" ON "governance_incident_risks"("riskId");

-- AddForeignKey
ALTER TABLE "governance_incidents" ADD CONSTRAINT "governance_incidents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_incidents" ADD CONSTRAINT "governance_incidents_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_incident_actions" ADD CONSTRAINT "governance_incident_actions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "governance_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_incident_actions" ADD CONSTRAINT "governance_incident_actions_ownerRoleId_fkey" FOREIGN KEY ("ownerRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_incident_actions" ADD CONSTRAINT "governance_incident_actions_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_incident_risks" ADD CONSTRAINT "governance_incident_risks_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "governance_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_incident_risks" ADD CONSTRAINT "governance_incident_risks_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "governance_risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
