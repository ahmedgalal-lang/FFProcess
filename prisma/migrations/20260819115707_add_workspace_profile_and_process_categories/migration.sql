-- AlterTable
ALTER TABLE "processes" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "description" TEXT,
ADD COLUMN     "industry" TEXT;

-- CreateTable
CREATE TABLE "process_categories" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "process_categories_firmId_name_key" ON "process_categories"("firmId", "name");

-- CreateIndex
CREATE INDEX "processes_categoryId_idx" ON "processes"("categoryId");

-- AddForeignKey
ALTER TABLE "processes" ADD CONSTRAINT "processes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "process_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_categories" ADD CONSTRAINT "process_categories_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
