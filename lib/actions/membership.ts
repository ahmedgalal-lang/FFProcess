"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { auth, signIn } from "@/lib/auth/config";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { canChangeLastAdmin } from "@/lib/domain/access-control";
import { sendInvitationEmail } from "@/lib/email/invitation";
import {
  ok,
  notFound,
  validationError,
  type ActionResult,
  type ActionError,
} from "@/lib/actions/errors";

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function baseUrl() {
  return process.env["NEXTAUTH_URL"] ?? "http://localhost:3000";
}

const inviteSchema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().email(),
  accessLevel: z.enum(["VIEWER", "EDITOR", "ADMIN"]),
});

export async function inviteMember(
  input: z.infer<typeof inviteSchema>
): Promise<ActionResult<{ id: string; acceptUrl: string; emailSent: boolean }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid invitation", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const [existingUser, workspace, inviter] = await Promise.all([
    prisma.user.findUnique({ where: { email: parsed.data.email } }),
    prisma.workspace.findUniqueOrThrow({ where: { id: parsed.data.workspaceId } }),
    prisma.user.findUnique({ where: { id: access.data.userId } }),
  ]);

  const existingMember = await prisma.member.findFirst({
    where: {
      workspaceId: parsed.data.workspaceId,
      status: { in: ["ACTIVE", "PENDING"] },
      OR: [
        ...(existingUser ? [{ userId: existingUser.id }] : []),
        { invitedEmail: parsed.data.email },
      ],
    },
  });
  if (existingMember) {
    return validationError(
      existingMember.status === "ACTIVE"
        ? `${parsed.data.email} is already a member of this workspace.`
        : `${parsed.data.email} already has a pending invitation to this workspace.`
    );
  }

  const inviteToken = randomBytes(24).toString("base64url");
  const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

  const member = await prisma.member.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      userId: existingUser?.id,
      invitedEmail: parsed.data.email,
      accessLevel: parsed.data.accessLevel,
      status: "PENDING",
      inviteToken,
      inviteTokenExpiresAt,
    },
  });

  const acceptUrl = `${baseUrl()}/invitations/${inviteToken}/accept`;
  const { sent } = await sendInvitationEmail({
    to: parsed.data.email,
    workspaceName: workspace.name,
    acceptUrl,
    invitedByName: inviter?.name ?? null,
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/members`);
  return ok({ id: member.id, acceptUrl, emailSent: sent });
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

async function loadPendingInvitation(token: string) {
  const member = await prisma.member.findUnique({
    where: { inviteToken: token },
    include: { workspace: true },
  });
  if (!member || member.status !== "PENDING" || !member.invitedEmail) return null;
  if (!member.inviteTokenExpiresAt || member.inviteTokenExpiresAt < new Date()) return null;
  return member;
}

/** Public lookup used by the accept-invitation page; no auth required (the token IS the credential). */
export async function getInvitationByToken(token: string) {
  const member = await loadPendingInvitation(token);
  if (!member) return null;
  const existingUser = await prisma.user.findUnique({ where: { email: member.invitedEmail! } });
  return {
    workspaceName: member.workspace.name,
    invitedEmail: member.invitedEmail!,
    accessLevel: member.accessLevel,
    hasExistingAccount: !!existingUser,
  };
}

const acceptExistingSchema = z.object({ token: z.string().min(1) });

/** Accepts an invitation for the currently signed-in user (their email must match the invite). */
export async function acceptInvitation(
  input: z.infer<typeof acceptExistingSchema>
): Promise<ActionResult<{ workspaceId: string }>> {
  const parsed = acceptExistingSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid token");

  const member = await loadPendingInvitation(parsed.data.token);
  if (!member) return notFound();

  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "UNAUTHORIZED" };
  if (session.user.email !== member.invitedEmail) return { ok: false, error: "FORBIDDEN", required: "VIEWER" };

  await prisma.member.update({
    where: { id: member.id },
    data: {
      status: "ACTIVE",
      userId: member.userId ?? session.user.id,
      inviteToken: null,
      inviteTokenExpiresAt: null,
    },
  });

  revalidatePath(`/workspaces/${member.workspaceId}/members`);
  return ok({ workspaceId: member.workspaceId });
}

const acceptNewAccountSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
});

/** Creates an account for a brand-new invitee, accepts the invitation, and signs them in. */
export async function acceptInvitationWithNewAccount(
  input: z.infer<typeof acceptNewAccountSchema>
): Promise<ActionResult<{ workspaceId: string }>> {
  const parsed = acceptNewAccountSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const member = await loadPendingInvitation(parsed.data.token);
  if (!member) return notFound();

  const existingUser = await prisma.user.findUnique({ where: { email: member.invitedEmail! } });
  if (existingUser) {
    return validationError("An account with this email already exists — log in to accept instead.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const workspaceId = member.workspaceId;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: member.invitedEmail!, name: parsed.data.name, passwordHash },
    });
    await tx.member.update({
      where: { id: member.id },
      data: { status: "ACTIVE", userId: user.id, inviteToken: null, inviteTokenExpiresAt: null },
    });
  });

  revalidatePath(`/workspaces/${workspaceId}/members`);

  await signIn("credentials", {
    email: member.invitedEmail,
    password: parsed.data.password,
    redirect: false,
  });

  return ok({ workspaceId });
}
