"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { canChangeLastAdmin } from "@/lib/domain/access-control";
import { ok, validationError, type ActionResult, type ActionError } from "@/lib/actions/errors";

const inviteSchema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().email(),
  accessLevel: z.enum(["VIEWER", "EDITOR", "ADMIN"]),
});

export async function inviteMember(
  input: z.infer<typeof inviteSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid invitation", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  const member = await prisma.member.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      userId: existingUser?.id,
      invitedEmail: parsed.data.email,
      accessLevel: parsed.data.accessLevel,
      status: "PENDING",
    },
  });

  // NOTE: invitation email sending (Resend) is not wired up in this pass — the
  // Member record is created in PENDING status and an admin can share the
  // workspace link directly for now. See tasks.md T054.

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/members`);
  return ok({ id: member.id });
}

const changeAccessSchema = z.object({
  workspaceId: z.string().min(1),
  memberId: z.string().min(1),
  accessLevel: z.enum(["VIEWER", "EDITOR", "ADMIN"]),
});

export async function changeMemberAccessLevel(
  input: z.infer<typeof changeAccessSchema>
): Promise<ActionResult<{ id: string }> | ActionError> {
  const parsed = changeAccessSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const target = await prisma.member.findUniqueOrThrow({ where: { id: parsed.data.memberId } });

  if (target.accessLevel === "ADMIN" && parsed.data.accessLevel !== "ADMIN") {
    const activeAdmins = await prisma.member.count({
      where: { workspaceId: parsed.data.workspaceId, accessLevel: "ADMIN", status: "ACTIVE" },
    });
    if (!canChangeLastAdmin(activeAdmins)) {
      return { ok: false, error: "LAST_ADMIN" };
    }
  }

  const member = await prisma.member.update({
    where: { id: parsed.data.memberId },
    data: { accessLevel: parsed.data.accessLevel },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/members`);
  return ok({ id: member.id });
}

const removeMemberSchema = z.object({
  workspaceId: z.string().min(1),
  memberId: z.string().min(1),
});

export async function removeMember(
  input: z.infer<typeof removeMemberSchema>
): Promise<ActionResult<{ id: string }> | ActionError> {
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const target = await prisma.member.findUniqueOrThrow({ where: { id: parsed.data.memberId } });

  if (target.accessLevel === "ADMIN") {
    const activeAdmins = await prisma.member.count({
      where: { workspaceId: parsed.data.workspaceId, accessLevel: "ADMIN", status: "ACTIVE" },
    });
    if (!canChangeLastAdmin(activeAdmins)) {
      return { ok: false, error: "LAST_ADMIN" };
    }
  }

  await prisma.member.update({ where: { id: parsed.data.memberId }, data: { status: "REMOVED" } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/members`);
  return ok({ id: parsed.data.memberId });
}
