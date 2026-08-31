-- Ordering activities within a value-chain phase.
--
-- A step already has `order`, its place in its own process. This is a
-- different sequence: where it sits among the activities from every process
-- that share a phase. Existing rows all start at 0, so a phase's activities
-- keep whatever order they are shown in today until someone arranges them.


-- AlterTable
ALTER TABLE "process_steps" ADD COLUMN     "phaseOrder" INTEGER NOT NULL DEFAULT 0;

