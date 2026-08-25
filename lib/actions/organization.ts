"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireFirmOwner, requireWorkspaceAccess } from "@/lib/auth/workspace";
import { canChangeLastFirmOwner } from "@/lib/domain/access-control";
import { validateLogoDataUrl } from "@/lib/domain/firm-logo";
import { ok, validationError, type ActionResult, type ActionError } from "@/lib/actions/errors";

export type WorkspaceListEntry = {
  id: string;
  name: string;
  accessVia: "MEMBER" | "OWNER_CARVEOUT";
  accessLevel: "VIEWER" | "EDITOR" | "ADMIN";
};

/** Firm Owner-only: every Workspace in the Firm, per Constitution Principle V's carve-out. */
export async function listAllWorkspaces(): Promise<ActionResult<WorkspaceListEntry[]>> {
  const access = await requireFirmOwner();
  if (!access.ok) return access;

  const firmMember = await prisma.firmMember.findUniqueOrThrow({ where: { userId: access.data.userId } });

  const workspaces = await prisma.workspace.findMany({
    where: { firmId: firmMember.firmId },
    include: { members: { where: { userId: access.data.userId, status: "ACTIVE" } } },
  });

  return ok(
    workspaces.map((w) => {
      const explicitMember = w.members[0];
      return {
        id: w.id,
        name: w.name,
        accessVia: explicitMember ? "MEMBER" : "OWNER_CARVEOUT",
        accessLevel: explicitMember?.accessLevel ?? "ADMIN",
      };
    })
  );
}

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Firm Owner-only: create a new client Workspace under the caller's Firm. */
export async function createWorkspace(
  input: z.infer<typeof createWorkspaceSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createWorkspaceSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireFirmOwner();
  if (!access.ok) return access;

  const firmMember = await prisma.firmMember.findUniqueOrThrow({ where: { userId: access.data.userId } });

  const workspace = await prisma.workspace.create({
    data: {
      firmId: firmMember.firmId,
      name: parsed.data.name,
      industry: parsed.data.industry || undefined,
      description: parsed.data.description || undefined,
    },
  });

  revalidatePath("/workspaces");
  return ok({ id: workspace.id });
}

const updateWorkspaceProfileSchema = z.object({
  workspaceId: z.string().min(1),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * Updates a Workspace's industry/context notes — the free-text background
 * an AI review draws on for sector-appropriate suggestions. Workspace
 * ADMIN-level, not Firm Owner-only: this is ordinary engagement upkeep, not
 * the structural create/delete of the Workspace itself.
 */
export async function updateWorkspaceProfile(
  input: z.infer<typeof updateWorkspaceProfileSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateWorkspaceProfileSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const workspace = await prisma.workspace.update({
    where: { id: parsed.data.workspaceId },
    data: {
      industry: parsed.data.industry || null,
      description: parsed.data.description || null,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}`);
  return ok({ id: workspace.id });
}

const deleteWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  confirmName: z.string().min(1),
});

/**
 * Firm Owner-only: permanently delete a Workspace and everything under it
 * (Members, Roles, People, Processes, RACI/Authority data — all cascade). The
 * caller must retype the Workspace's exact name to confirm, since this cannot
 * be undone.
 */
export async function deleteWorkspace(
  input: z.infer<typeof deleteWorkspaceSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteWorkspaceSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireFirmOwner();
  if (!access.ok) return access;

  const firmMember = await prisma.firmMember.findUniqueOrThrow({ where: { userId: access.data.userId } });

  const workspace = await prisma.workspace.findUnique({ where: { id: parsed.data.workspaceId } });
  if (!workspace || workspace.firmId !== firmMember.firmId) return validationError("Workspace not found");

  if (workspace.name !== parsed.data.confirmName) {
    return validationError(`Type "${workspace.name}" exactly to confirm deletion.`);
  }

  await prisma.workspace.delete({ where: { id: parsed.data.workspaceId } });

  revalidatePath("/workspaces");
  return ok({ id: parsed.data.workspaceId });
}

const updateFirmLogoSchema = z.object({ logoDataUrl: z.string().min(1).nullable() });

/** Firm Owner-only: set or clear the company logo shown in the header on every page. */
export async function updateFirmLogo(
  input: z.infer<typeof updateFirmLogoSchema>
): Promise<ActionResult<{ logoDataUrl: string | null }>> {
  const parsed = updateFirmLogoSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireFirmOwner();
  if (!access.ok) return access;

  if (parsed.data.logoDataUrl !== null) {
    const validation = validateLogoDataUrl(parsed.data.logoDataUrl);
    if (!validation.ok) return validationError(validation.message);
  }

  const firmMember = await prisma.firmMember.findUniqueOrThrow({ where: { userId: access.data.userId } });

  await prisma.firm.update({
    where: { id: firmMember.firmId },
    data: { logoDataUrl: parsed.data.logoDataUrl },
  });

  revalidatePath("/firm/settings");
  revalidatePath("/", "layout");
  return ok({ logoDataUrl: parsed.data.logoDataUrl });
}

const addOwnerSchema = z.object({ userId: z.string().min(1) });

export async function addFirmOwner(
  input: z.infer<typeof addOwnerSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = addOwnerSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireFirmOwner();
  if (!access.ok) return access;

  const callerFirm = await prisma.firmMember.findUniqueOrThrow({ where: { userId: access.data.userId } });

  const member = await prisma.firmMember.upsert({
    where: { userId: parsed.data.userId },
    update: { role: "OWNER" },
    create: { firmId: callerFirm.firmId, userId: parsed.data.userId, role: "OWNER" },
  });

  revalidatePath("/firm/settings");
  return ok({ id: member.id });
}

const changeRoleSchema = z.object({
  firmMemberId: z.string().min(1),
  role: z.enum(["OWNER", "MEMBER"]),
});

export async function changeFirmMemberRole(
  input: z.infer<typeof changeRoleSchema>
): Promise<ActionResult<{ id: string }> | ActionError> {
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireFirmOwner();
  if (!access.ok) return access;

  const target = await prisma.firmMember.findUniqueOrThrow({ where: { id: parsed.data.firmMemberId } });

  if (target.role === "OWNER" && parsed.data.role !== "OWNER") {
    const activeOwners = await prisma.firmMember.count({ where: { firmId: target.firmId, role: "OWNER" } });
    if (!canChangeLastFirmOwner(activeOwners)) {
      return { ok: false, error: "LAST_OWNER" };
    }
  }

  const updated = await prisma.firmMember.update({
    where: { id: parsed.data.firmMemberId },
    data: { role: parsed.data.role },
  });

  revalidatePath("/firm/settings");
  return ok({ id: updated.id });
}
