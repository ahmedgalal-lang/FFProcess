import "server-only";
import { prisma } from "@/lib/db/client";

/** Entries per page of the governance activity feed (spec 019). */
export const ACTIVITY_PAGE_SIZE = 50;

export type GovernanceActivityEntryT = {
  id: string;
  entityType: "ASPECT" | "ASSESSMENT" | "CHECKLIST_ITEM" | "RISK" | "POLICY";
  entityLabel: string;
  summary: string;
  actorName: string;
  createdAt: string; // ISO
};

/**
 * One page of a workspace's activity feed, newest first. The cursor is the
 * id of the last entry already shown; ties on the timestamp break by id, so
 * paging never skips or repeats an entry. Callers check access first.
 */
export async function loadGovernanceActivity(
  workspaceId: string,
  cursor?: string
): Promise<{ entries: GovernanceActivityEntryT[]; nextCursor: string | null }> {
  const rows = await prisma.governanceActivityLogEntry.findMany({
    where: { workspaceId },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ACTIVITY_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, ACTIVITY_PAGE_SIZE);
  return {
    entries: page.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityLabel: r.entityLabel,
      summary: r.summary,
      actorName: r.actor.name ?? r.actor.email,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > ACTIVITY_PAGE_SIZE ? page[page.length - 1]!.id : null,
  };
}
