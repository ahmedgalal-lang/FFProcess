-- DropForeignKey
ALTER TABLE "authority_assignments" DROP CONSTRAINT "authority_assignments_coApprovalRoleId_fkey";

-- AlterTable
ALTER TABLE "authority_assignments" DROP COLUMN "coApprovalRoleId",
ADD COLUMN     "coApproverRoleId" TEXT;

-- AddForeignKey
ALTER TABLE "authority_assignments" ADD CONSTRAINT "authority_assignments_coApproverRoleId_fkey" FOREIGN KEY ("coApproverRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

