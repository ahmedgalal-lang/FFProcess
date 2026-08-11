import "server-only";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { hasSufficientAccess, type AccessLevel } from "@/lib/domain/access-control";
import { forbidden, unauthorized, type ActionResult } from "@/lib/actions/errors";

export type WorkspaceAccess = {
  userId: string;
  accessLevel: AccessLevel;
  accessVia: "MEMBER" | "OWNER_CARVEOUT";
};

/**
 * Resolves the current session's effective access to a Workspace, per Constitution
 * Principle V: access comes from either an explicit Member record, or the caller
 * holding FirmMember.role = OWNER (the one explicit carve-out). Every Server Action
 * and route handler that touches Workspace-scoped data MUST call this — the client
 * payload's workspaceId is never trusted for authorization by itself.
 */
export async function requireWorkspaceAccess(
  workspaceId: string,
  minLevel: AccessLevel = "VIEWER"
): Promise<ActionResult<WorkspaceAccess>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();

  const firmMember = await prisma.firmMember.findUnique({ where: { userId } });
  if (firmMember?.role === "OWNER") {
    return { ok: true, data: { userId, accessLevel: "ADMIN", accessVia: "OWNER_CARVEOUT" } };
  }

  const member = await prisma.member.findFirst({
    where: { workspaceId, userId, status: "ACTIVE" },
  });
  if (!member) return unauthorized();

  if (!hasSufficientAccess(member.accessLevel as AccessLevel, minLevel)) {
    return forbidden(minLevel);
  }

  return { ok: true, data: { userId, accessLevel: member.accessLevel as AccessLevel, accessVia: "MEMBER" } };
}

/** Resolves whether the current session is a Firm Owner (Constitution Principle V carve-out). */
export async function requireFirmOwner(): Promise<ActionResult<{ userId: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();

  const firmMember = await prisma.firmMember.findUnique({ where: { userId } });
  if (firmMember?.role !== "OWNER") return forbidden("ADMIN");

  return { ok: true, data: { userId } };
}
