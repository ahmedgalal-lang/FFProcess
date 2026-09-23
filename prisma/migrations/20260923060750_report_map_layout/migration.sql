-- CreateEnum
CREATE TYPE "ReportMapLayout" AS ENUM ('FLOW', 'ROLES');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "reportMapLayout" "ReportMapLayout" NOT NULL DEFAULT 'FLOW';
