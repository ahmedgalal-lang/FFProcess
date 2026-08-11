"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { validateRaciMatrix, type RaciActivity, type RaciIssue } from "@/lib/domain/raci-validation";
import { ok, validationError, type ActionResult } from "@/lib/actions/errors";

const setAssignmentSchema = z.object({
  workspaceId: z.string().min(1),
  activityId: z.string().min(1),
  roleId: z.string().min(1),
  code: z.enum(["RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"]).nullable(),
});

export async function setRaciAssignment(
  input: z.infer<typeof setAssignmentSchema>
): Promise<ActionResult<{ cleared: boolean }>> {
  const parsed = setAssignmentSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid assignment", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { activityId, roleId, code } = parsed.data;

  if (code === null) {
    await prisma.raciAssignment.deleteMany({ where: { activityId, roleId } });
  } else {
    await prisma.raciAssignment.upsert({
      where: { activityId_roleId: { activityId, roleId } },
      update: { code },
      create: { activityId, roleId, code },
    });
  }

  const activity = await prisma.activity.findUniqueOrThrow({
    where: { id: activityId },
    select: { processId: true },
  });
  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${activity.processId}/raci`);
  return ok({ cleared: code === null });
}

async function loadRaciActivities(processId: string): Promise<RaciActivity[]> {
  const activities = await prisma.activity.findMany({
    where: { processId },
    include: { raciAssignments: true },
    orderBy: { order: "asc" },
  });

  return activities.map((a) => ({
    activityId: a.id,
    name: a.name,
    assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
  }));
}

const processIdSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
});

export async function validateRaciMatrixAction(
  input: z.infer<typeof processIdSchema>
): Promise<ActionResult<{ issues: RaciIssue[] }>> {
  const parsed = processIdSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "VIEWER");
  if (!access.ok) return access;

  const activities = await loadRaciActivities(parsed.data.processId);
  return ok({ issues: validateRaciMatrix(activities) });
}

export async function finalizeRaciMatrix(
  input: z.infer<typeof processIdSchema>
): Promise<ActionResult<{ status: "FINAL" }> | { ok: false; error: "VALIDATION_FAILED"; issues: RaciIssue[] }> {
  const parsed = processIdSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues) as never;

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access as never;

  const activities = await loadRaciActivities(parsed.data.processId);
  const issues = validateRaciMatrix(activities);
  if (issues.length > 0) {
    return { ok: false, error: "VALIDATION_FAILED", issues };
  }

  await prisma.raciMatrixStatus.upsert({
    where: { processId: parsed.data.processId },
    update: { status: "FINAL", finalizedAt: new Date() },
    create: { processId: parsed.data.processId, status: "FINAL", finalizedAt: new Date() },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/raci`);
  return ok({ status: "FINAL" });
}

export async function reopenRaciMatrix(
  input: z.infer<typeof processIdSchema>
): Promise<ActionResult<{ status: "DRAFT" }>> {
  const parsed = processIdSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  await prisma.raciMatrixStatus.upsert({
    where: { processId: parsed.data.processId },
    update: { status: "DRAFT", finalizedAt: null },
    create: { processId: parsed.data.processId, status: "DRAFT" },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/raci`);
  return ok({ status: "DRAFT" });
}
