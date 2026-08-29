-- CreateEnum
CREATE TYPE "AuthorityDirection" AS ENUM ('GREATER_THAN', 'GREATER_OR_EQUAL', 'LESS_THAN', 'LESS_OR_EQUAL', 'EQUAL_NO_APPROVAL');

-- AlterTable: add the new columns first, so existing data can be moved across
-- before the old `unit` column goes away.
ALTER TABLE "authority_assignments"
ADD COLUMN     "direction" "AuthorityDirection" NOT NULL DEFAULT 'GREATER_THAN',
ADD COLUMN     "escalationRoleId" TEXT,
ADD COLUMN     "slaDays" INTEGER;

-- Data migration: a row whose unit was DAYS was using `threshold` to mean "N
-- days", which is now the SLA. Move that number into slaDays and clear the
-- threshold, since threshold is money-only from here on.
UPDATE "authority_assignments"
SET "slaDays" = ROUND("threshold")::INTEGER,
    "threshold" = NULL
WHERE "unit" = 'DAYS' AND "threshold" IS NOT NULL;

-- A DAYS row's co-approval threshold was also a day count; it has no money
-- meaning, so clear it rather than silently reinterpreting it as currency.
UPDATE "authority_assignments"
SET "coApprovalAboveThreshold" = NULL
WHERE "unit" = 'DAYS' AND "coApprovalAboveThreshold" IS NOT NULL;

-- AlterTable
ALTER TABLE "authority_assignments" DROP COLUMN "unit";

-- DropEnum
DROP TYPE "AuthorityUnit";

-- AddForeignKey
ALTER TABLE "authority_assignments" ADD CONSTRAINT "authority_assignments_escalationRoleId_fkey" FOREIGN KEY ("escalationRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
