-- Explicit ordering for Process Map steps.
--
-- Steps were ordered by "createdAt" everywhere, so a step added later always
-- landed at the bottom of the Steps List even when it belonged in the middle.
-- The backfill numbers each process's existing steps in exactly the order they
-- are shown today, so nothing moves when this ships; from here the column is
-- what ordering follows.

-- AlterTable
ALTER TABLE "process_steps" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- Backfill: rank each process's steps by their current (createdAt) order.
UPDATE "process_steps" AS s
SET "order" = ranked.rn
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "processId" ORDER BY "createdAt" ASC, "id" ASC) - 1 AS rn
  FROM "process_steps"
) AS ranked
WHERE s."id" = ranked."id";

-- CreateIndex
CREATE INDEX "process_steps_processId_order_idx" ON "process_steps"("processId", "order");
