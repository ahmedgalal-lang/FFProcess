-- CreateEnum
CREATE TYPE "TranslationOrigin" AS ENUM ('AI', 'MANUAL');

-- CreateTable
CREATE TABLE "content_translations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "origin" "TranslationOrigin" NOT NULL DEFAULT 'AI',
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_translations_workspaceId_locale_updatedAt_idx" ON "content_translations"("workspaceId", "locale", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_translations_workspaceId_locale_sourceHash_key" ON "content_translations"("workspaceId", "locale", "sourceHash");

-- AddForeignKey
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
