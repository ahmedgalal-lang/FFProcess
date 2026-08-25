-- AlterTable
ALTER TABLE "processes" ADD COLUMN     "raciVisibleRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
