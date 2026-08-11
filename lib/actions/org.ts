"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { ok, validationError, type ActionResult } from "@/lib/actions/errors";

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
});

export async function createPerson(
  input: z.infer<typeof createPersonSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPersonSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid person input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const person = await prisma.person.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      email: parsed.data.email || undefined,
      personRoles: {
        create: parsed.data.roleIds.map((roleId) => ({ roleId })),
      },
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/org`);
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
