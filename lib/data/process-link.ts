import "server-only";
import { prisma } from "@/lib/db/client";
import { notFound, validationError, type ActionError } from "@/lib/actions/errors";

/**
 * Whether a governance record may be linked to this process: it must belong
 * to the workspace (else not-found), and processes are archived, not
 * deleted, so an archived one can't be newly linked, though a record
 * already linked to it keeps the link.
 *
 * Returns the error to send back, or null when the link is fine.
 */
export async function checkLinkableProcess(
  workspaceId: string,
  processId: string | null,
  currentProcessId: string | null = null
): Promise<ActionError | null> {
  if (!processId) return null;
  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process || process.workspaceId !== workspaceId) return notFound();
  if (process.archivedAt && processId !== currentProcessId) return validationError(`"${process.name}" is archived.`);
  return null;
}
