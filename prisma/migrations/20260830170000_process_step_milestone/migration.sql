-- Steps worth seeing from the engagement level.
--
-- The Helicopter View draws each process as a rail with its milestones as
-- beads; this is what puts a step on that rail. Off for every existing step:
-- marking is a deliberate choice per process, and a milestone only means
-- something because most steps aren't one.

-- AlterTable
ALTER TABLE "process_steps" ADD COLUMN     "milestone" BOOLEAN NOT NULL DEFAULT false;
