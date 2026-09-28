import "server-only";
import { prisma } from "@/lib/db/client";
import { notFound, validationError, type ActionError } from "@/lib/actions/errors";

/**
 * Whether a role or person may be made the owner of a governance record in
 * this workspace: it must belong to the workspace (else not-found, like every
 * other id) and must not be archived — unless it is the record's current
 * owner, so a record whose owner was archived after assignment can still be
 * saved. Roles and people are archived in this app, never deleted.
 *
 * Returns the error to send back, or null when the owner is fine.
 */
export async function checkAssignableOwner(
  workspaceId: string,
  roleId: string | null,
  personId: string | null,
  current: { roleId: string | null; personId: string | null } = { roleId: null, personId: null }
): Promise<ActionError | null> {
  if (roleId && personId) return validationError("An owner is a role or a person, not both.");
  if (roleId) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.workspaceId !== workspaceId) return notFound();
    if (role.archivedAt && roleId !== current.roleId) return validationError(`"${role.name}" is archived.`);
  }
  if (personId) {
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person || person.workspaceId !== workspaceId) return notFound();
    if (person.archivedAt && personId !== current.personId) return validationError(`"${person.name}" is archived.`);
  }
  return null;
}
