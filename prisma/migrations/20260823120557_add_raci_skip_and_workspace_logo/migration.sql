-- AlterTable
ALTER TABLE "process_steps" ADD COLUMN     "raciSkipped" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "logoUrl" TEXT;
