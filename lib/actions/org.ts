"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { wouldCreateManagerCycle } from "@/lib/domain/org-chart";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";

const createRoleSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});

export async function createRole(input: z.infer<typeof createRoleSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = createRoleSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid role input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const existing = await prisma.role.findFirst({
    where: { workspaceId: parsed.data.workspaceId, name: parsed.data.name, archivedAt: null },
  });
  if (existing) return validationError(`A Role named "${parsed.data.name}" already exists in this workspace.`);

  const role = await prisma.role.create({
    data: { workspaceId: parsed.data.workspaceId, name: parsed.data.name },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/org`);
  return ok({ id: role.id });
}

const archiveRoleSchema = z.object({
  workspaceId: z.string().min(1),
  roleId: z.string().min(1),
});

export async function archiveRole(input: z.infer<typeof archiveRoleSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = archiveRoleSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const role = await prisma.role.update({
    where: { id: parsed.data.roleId },
    data: { archivedAt: new Date() },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/org`);
  return ok({ id: role.id });
}

const createPersonSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().email().optional().or(z.literal("")),
  roleIds: z.array(z.string().min(1)).default([]),
  managerId: z.string().min(1).optional().or(z.literal("")),
});

export async function createPerson(
  input: z.infer<typeof createPersonSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPersonSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid person input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const managerId = parsed.data.managerId || undefined;
  if (managerId) {
    const manager = await prisma.person.findUnique({ where: { id: managerId } });
    if (!manager || manager.workspaceId !== parsed.data.workspaceId) return notFound();
  }

  const person = await prisma.person.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      email: parsed.data.email || undefined,
      managerId,
      personRoles: {
        create: parsed.data.roleIds.map((roleId) => ({ roleId })),
      },
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/org`);
  return ok({ id: person.id });
}

const updatePersonManagerSchema = z.object({
  workspaceId: z.string().min(1),
  personId: z.string().min(1),
  managerId: z.string().min(1).nullable(),
});

/** Sets or clears a Person's reporting line, rejecting anything that would create a cycle. */
export async function updatePersonManager(
  input: z.infer<typeof updatePersonManagerSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updatePersonManagerSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const people = await prisma.person.findMany({
    where: { workspaceId: parsed.data.workspaceId },
    select: { id: true, managerId: true },
  });
  if (!people.some((p) => p.id === parsed.data.personId)) return notFound();

  if (parsed.data.managerId) {
    if (!people.some((p) => p.id === parsed.data.managerId)) return notFound();
    const managerOf = new Map(people.map((p) => [p.id, p.managerId]));
    if (wouldCreateManagerCycle(parsed.data.personId, parsed.data.managerId, managerOf)) {
      return validationError("That manager selection would create a circular reporting line.");
    }
  }

  const person = await prisma.person.update({
    where: { id: parsed.data.personId },
    data: { managerId: parsed.data.managerId },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/org`);
  revalidatePath(`/workspaces/${parsed.data.workspaceId}/org/chart`);
  return ok({ id: person.id });
}

const archivePersonSchema = z.object({
  workspaceId: z.string().min(1),
  personId: z.string().min(1),
});

export async function archivePerson(
  input: z.infer<typeof archivePersonSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = archivePersonSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const person = await prisma.person.update({
    where: { id: parsed.data.personId },
    data: { archivedAt: new Date() },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/org`);
  return ok({ id: person.id });
}
