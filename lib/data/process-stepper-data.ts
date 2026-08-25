import "server-only";
import { prisma } from "@/lib/db/client";

/** The counts the build-sequence stepper needs, shared by the Map/RACI/Authority/Review pages. */
export async function getProcessStepperCounts(processId: string) {
  const [stepsCount, activitiesCount, matrixStatus, authorityAssignedCount] = await Promise.all([
    prisma.processStep.count({ where: { processId } }),
    prisma.activity.count({ where: { processId } }),
    prisma.raciMatrixStatus.findUnique({ where: { processId } }),
    prisma.authorityAssignment.count({ where: { processId } }),
  ]);

  return {
    stepsCount,
    activitiesCount,
    raciStatus: (matrixStatus?.status ?? "DRAFT") as "DRAFT" | "FINAL",
    authorityAssignedCount,
  };
}
