-- AlterTable
ALTER TABLE "process_steps" ADD COLUMN     "detailedAction" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "exceptionHandling" TEXT;

-- AlterTable
ALTER TABLE "processes" ADD COLUMN     "externalEntities" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "inScope" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "kpis" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "outOfScope" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "processPurpose" TEXT;
