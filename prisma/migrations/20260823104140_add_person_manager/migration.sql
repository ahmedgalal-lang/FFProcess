-- AlterTable
ALTER TABLE "people" ADD COLUMN     "managerId" TEXT;

-- CreateIndex
CREATE INDEX "people_managerId_idx" ON "people"("managerId");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
