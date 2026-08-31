-- Value-chain phases.
--
-- A Phase is a named, ordered stage of the engagement — Initiation, Evaluation,
-- Proposal, Award, Execution, Finance, Closure — that steps from *different*
-- processes can share, which is what lets one board show the whole value chain.
-- Distinct from ProcessCategory, which is firm-wide and files a whole Process.
--
-- Nothing is backfilled: existing steps are unphased until someone puts them in
-- a phase, and a process map works perfectly well without any.


-- AlterTable
ALTER TABLE "process_steps" ADD COLUMN     "phaseId" TEXT;

-- CreateTable
CREATE TABLE "phases" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StepSupportingRoles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StepSupportingRoles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "phases_workspaceId_order_idx" ON "phases"("workspaceId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "phases_workspaceId_name_key" ON "phases"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "_StepSupportingRoles_B_index" ON "_StepSupportingRoles"("B");

-- CreateIndex
CREATE INDEX "process_steps_phaseId_idx" ON "process_steps"("phaseId");

-- AddForeignKey
ALTER TABLE "phases" ADD CONSTRAINT "phases_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StepSupportingRoles" ADD CONSTRAINT "_StepSupportingRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "process_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StepSupportingRoles" ADD CONSTRAINT "_StepSupportingRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

