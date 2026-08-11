-- AlterTable
ALTER TABLE "members" ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "inviteTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "members_inviteToken_key" ON "members"("inviteToken");

