"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireFirmOwner } from "@/lib/auth/workspace";
import { canChangeLastFirmOwner } from "@/lib/domain/access-control";
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
