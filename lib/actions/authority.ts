"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";

/** Verifies processId actually belongs to workspaceId, not just that the caller can access workspaceId. */
async function loadProcessInWorkspace(workspaceId: string, processId: string) {
  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process || process.workspaceId !== workspaceId) return null;
  return process;
}

/** Verifies rowId/kind refers to a real Activity or Step belonging to processId. */
async function loadRowInProcess(processId: string, rowId: string, kind: "activity" | "step") {
  if (kind === "activity") {
    const activity = await prisma.activity.findUnique({ where: { id: rowId } });
    if (!activity || activity.processId !== processId) return null;
    return { activityId: activity.id, stepId: null as string | null };
  }
  const step = await prisma.processStep.findUnique({ where: { id: rowId } });
  if (!step || step.processId !== processId) return null;
  return { activityId: null as string | null, stepId: step.id };
}

const rowRefSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  rowId: z.string().min(1),
  kind: z.enum(["activity", "step"]),
});

const saveAuthorityRowSchema = rowRefSchema
  .extend({
    unit: z.enum(["MONEY", "DAYS"]),
    threshold: z.number().nonnegative().nullable(),
    approverRoleId: z.string().min(1).nullable(),
    approverPersonId: z.string().min(1).nullable(),
    coApprovalAboveThreshold: z.number().nonnegative().nullable(),
    coApproverRoleId: z.string().min(1).nullable(),
  })
  .refine((v) => !(v.approverRoleId && v.approverPersonId), {
    message: "Choose a Role or a Person as approver, not both",
  });

/** Creates or updates a row's Authority data — threshold, approver, and optional co-approval tier. */
export async function saveAuthorityRow(
  input: z.infer<typeof saveAuthorityRowSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = saveAuthorityRowSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, processId, rowId, kind } = parsed.data;

  const process = await loadProcessInWorkspace(workspaceId, processId);
  if (!process) return notFound();

  const row = await loadRowInProcess(processId, rowId, kind);
  if (!row) return notFound();

  if (parsed.data.approverRoleId) {
    const role = await prisma.role.findUnique({ where: { id: parsed.data.approverRoleId } });
    if (!role || role.workspaceId !== workspaceId) return notFound();
  }
  if (parsed.data.approverPersonId) {
    const person = await prisma.person.findUnique({ where: { id: parsed.data.approverPersonId } });
    if (!person || person.workspaceId !== workspaceId) return notFound();
  }
  if (parsed.data.coApproverRoleId) {
    const role = await prisma.role.findUnique({ where: { id: parsed.data.coApproverRoleId } });
    if (!role || role.workspaceId !== workspaceId) return notFound();
  }

  const data = {
    unit: parsed.data.unit,
    threshold: parsed.data.threshold,
    approverRoleId: parsed.data.approverRoleId,
    approverPersonId: parsed.data.approverPersonId,
    coApprovalAboveThreshold: parsed.data.coApprovalAboveThreshold,
    coApproverRoleId: parsed.data.coApproverRoleId,
  };

  const where = row.activityId ? { activityId: row.activityId } : { stepId: row.stepId! };

  const assignment = await prisma.authorityAssignment.upsert({
    where,
    update: data,
    create: { processId, activityId: row.activityId, stepId: row.stepId, skipped: false, ...data },
  });

  revalidatePath(`/workspaces/${workspaceId}/processes/${processId}/authority`);
  return ok({ id: assignment.id });
}

async function setSkipped(
  input: z.infer<typeof rowRefSchema>,
  skipped: boolean
): Promise<ActionResult<{ id: string }>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, processId, rowId, kind } = parsed.data;

  const process = await loadProcessInWorkspace(workspaceId, processId);
  if (!process) return notFound();

  const row = await loadRowInProcess(processId, rowId, kind);
  if (!row) return notFound();

  const where = row.activityId ? { activityId: row.activityId } : { stepId: row.stepId! };

  const assignment = await prisma.authorityAssignment.upsert({
    where,
    update: { skipped },
    create: { processId, activityId: row.activityId, stepId: row.stepId, skipped },
  });

  revalidatePath(`/workspaces/${workspaceId}/processes/${processId}/authority`);
  return ok({ id: assignment.id });
}

/** Marks a row as intentionally not needing an Authority entry. */
export async function skipAuthorityRow(input: z.infer<typeof rowRefSchema>): Promise<ActionResult<{ id: string }>> {
  return setSkipped(input, true);
}

/** Reverses skipAuthorityRow. */
export async function unskipAuthorityRow(input: z.infer<typeof rowRefSchema>): Promise<ActionResult<{ id: string }>> {
  return setSkipped(input, false);
}

/**
 * Clears a row's Authority data (threshold, approver, co-approval, skip) back
 * to empty. The task itself — the underlying Activity or Process Map step —
 * is shared with the RACI table and is untouched; this only removes what was
 * entered here.
 */
export async function clearAuthorityRow(input: z.infer<typeof rowRefSchema>): Promise<ActionResult<{ rowId: string }>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, processId, rowId, kind } = parsed.data;

  const process = await loadProcessInWorkspace(workspaceId, processId);
  if (!process) return notFound();

  const row = await loadRowInProcess(processId, rowId, kind);
  if (!row) return notFound();

  const where = row.activityId ? { activityId: row.activityId } : { stepId: row.stepId! };
  await prisma.authorityAssignment.deleteMany({ where });

  revalidatePath(`/workspaces/${workspaceId}/processes/${processId}/authority`);
  return ok({ rowId });
}
