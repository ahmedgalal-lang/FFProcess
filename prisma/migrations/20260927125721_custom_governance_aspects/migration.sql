-- Custom governance aspects (spec 017): the seven governance "aspect" tabs
-- stop being a fixed, product-wide enum and become real per-workspace rows
-- a consultant can add, rename, and delete.

-- 1. New table
CREATE TABLE "governance_aspects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_aspects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "governance_aspects_workspaceId_name_key" ON "governance_aspects"("workspaceId", "name");

CREATE INDEX "governance_aspects_workspaceId_idx" ON "governance_aspects"("workspaceId");

ALTER TABLE "governance_aspects" ADD CONSTRAINT "governance_aspects_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Seed every workspace's seven built-in aspects, named exactly as the
--    removed GOVERNANCE_FOCUS_AREA_LABEL record already labelled them.
INSERT INTO "governance_aspects" ("id", "workspaceId", "name", "createdAt")
SELECT gen_random_uuid()::text, w."id", f."label", now()
FROM "workspaces" w
CROSS JOIN (VALUES
    ('BOARD_STRUCTURE', 'Board Structure'),
    ('RISK_CONTROLS', 'Risk & Internal Controls'),
    ('ETHICS_POLICY', 'Ethics Policy'),
    ('COMPENSATION', 'Compensation'),
    ('ESG', 'ESG'),
    ('DATA_INTEGRITY', 'Data Integrity'),
    ('ACCESSIBILITY', 'Accessibility')
) AS f("value", "label");

-- 3. Add aspectId to governance_assessments, backfill from the existing
--    enum column, then require it and add the FK.
ALTER TABLE "governance_assessments" ADD COLUMN "aspectId" TEXT;

UPDATE "governance_assessments" ga
SET "aspectId" = gasp."id"
FROM "governance_aspects" gasp
JOIN (VALUES
    ('BOARD_STRUCTURE', 'Board Structure'),
    ('RISK_CONTROLS', 'Risk & Internal Controls'),
    ('ETHICS_POLICY', 'Ethics Policy'),
    ('COMPENSATION', 'Compensation'),
    ('ESG', 'ESG'),
    ('DATA_INTEGRITY', 'Data Integrity'),
    ('ACCESSIBILITY', 'Accessibility')
) AS f("value", "label") ON f."label" = gasp."name"
WHERE gasp."workspaceId" = ga."workspaceId" AND f."value" = ga."focusArea"::text;

ALTER TABLE "governance_assessments" ALTER COLUMN "aspectId" SET NOT NULL;

DROP INDEX "governance_assessments_workspaceId_focusArea_key";

ALTER TABLE "governance_assessments" DROP COLUMN "focusArea";

CREATE UNIQUE INDEX "governance_assessments_aspectId_key" ON "governance_assessments"("aspectId");

ALTER TABLE "governance_assessments" ADD CONSTRAINT "governance_assessments_aspectId_fkey"
    FOREIGN KEY ("aspectId") REFERENCES "governance_aspects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Drop the now-unused enum type.
DROP TYPE "GovernanceFocusArea";
