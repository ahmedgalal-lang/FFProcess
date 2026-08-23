import "server-only";
import { prisma } from "@/lib/db/client";
import { toPersistedFinding, type PersistedReviewFinding } from "@/lib/domain/review-findings";

const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Active (non-dismissed) findings for a process, for the Review page's initial render. */
export async function getActiveReviewFindings(processId: string): Promise<PersistedReviewFinding[]> {
  const findings = await prisma.reviewFinding.findMany({
    where: { processId, status: { not: "DISMISSED" } },
    include: { integratedStep: true },
  });
  findings.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return sev !== 0 ? sev : a.createdAt.getTime() - b.createdAt.getTime();
  });
  return findings.map(toPersistedFinding);
}
