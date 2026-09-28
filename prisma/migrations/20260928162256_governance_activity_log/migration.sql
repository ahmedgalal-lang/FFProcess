-- CreateEnum
CREATE TYPE "GovernanceActivityEntityType" AS ENUM ('ASPECT', 'ASSESSMENT', 'CHECKLIST_ITEM', 'RISK', 'POLICY');

-- CreateTable
CREATE TABLE "governance_activity_log_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entityType" "GovernanceActivityEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_activity_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_activity_log_entries_workspaceId_createdAt_idx" ON "governance_activity_log_entries"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "governance_activity_log_entries" ADD CONSTRAINT "governance_activity_log_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_activity_log_entries" ADD CONSTRAINT "governance_activity_log_entries_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
