-- AlterTable
ALTER TABLE "processes" ADD COLUMN     "branchFromStepId" TEXT;

-- AddForeignKey: ON DELETE SET NULL, so removing the source step drops the
-- branch link rather than deleting a process another team may own.
ALTER TABLE "processes" ADD CONSTRAINT "processes_branchFromStepId_fkey" FOREIGN KEY ("branchFromStepId") REFERENCES "process_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index: the Process Map looks up "what branches off this step" per step.
CREATE INDEX "processes_branchFromStepId_idx" ON "processes"("branchFromStepId");
