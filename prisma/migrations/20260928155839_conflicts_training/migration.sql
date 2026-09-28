-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('DECLARED', 'UNDER_REVIEW', 'MITIGATED', 'CLOSED');

-- CreateTable
CREATE TABLE "conflicts_of_interest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "relatedParty" TEXT NOT NULL,
    "declaredOn" TIMESTAMP(3) NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'DECLARED',
    "mitigationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conflicts_of_interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_courses" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validityMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_completions" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "completedOn" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conflicts_of_interest_workspaceId_idx" ON "conflicts_of_interest"("workspaceId");

-- CreateIndex
CREATE INDEX "conflicts_of_interest_personId_idx" ON "conflicts_of_interest"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "training_courses_workspaceId_name_key" ON "training_courses"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "training_completions_courseId_idx" ON "training_completions"("courseId");

-- CreateIndex
CREATE INDEX "training_completions_personId_idx" ON "training_completions"("personId");

-- AddForeignKey
ALTER TABLE "conflicts_of_interest" ADD CONSTRAINT "conflicts_of_interest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts_of_interest" ADD CONSTRAINT "conflicts_of_interest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_completions" ADD CONSTRAINT "training_completions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_completions" ADD CONSTRAINT "training_completions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
