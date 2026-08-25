-- AlterTable
ALTER TABLE "firms" DROP COLUMN "logoDataUrl";

-- AlterTable
ALTER TABLE "workspaces" DROP COLUMN "logoUrl",
ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "logoDataUrl" TEXT;

