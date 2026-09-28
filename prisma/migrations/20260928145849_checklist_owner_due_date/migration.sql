-- AlterTable
ALTER TABLE "governance_checklist_items" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "ownerPersonId" TEXT,
ADD COLUMN     "ownerRoleId" TEXT;

-- AddForeignKey
ALTER TABLE "governance_checklist_items" ADD CONSTRAINT "governance_checklist_items_ownerRoleId_fkey" FOREIGN KEY ("ownerRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_checklist_items" ADD CONSTRAINT "governance_checklist_items_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
