"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { validateRaciMatrix, type RaciActivity, type RaciIssue } from "@/lib/domain/raci-validation";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";

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

const setStepRaciCellSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  stepId: z.string().min(1),
  roleId: z.string().min(1),
  code: z.enum(["RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"]).nullable(),
});

/**
 * Sets one role's RACI code for a Process Map step that doesn't have a
 * linked Activity yet — creating one (reusing it if it already exists) the
 * first time a cell on that step's row is filled in. Clears raciSkipped,
 * in case the step was previously skipped and is now being assigned
 * instead. This is what makes every step in the RACI table immediately
 * assignable without a separate "add to RACI" step first.
 */
export async function setStepRaciCell(
  input: z.infer<typeof setStepRaciCellSchema>
): Promise<ActionResult<{ activityId: string }>> {
  const parsed = setStepRaciCellSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { processId, stepId, roleId, code } = parsed.data;

  const step = await prisma.processStep.findUnique({ where: { id: stepId } });
  if (!step || step.processId !== processId) return notFound();

  const activity = await prisma.$transaction(async (tx) => {
    let activity = await tx.activity.findFirst({ where: { relatedStepId: stepId } });
    if (!activity) {
      const count = await tx.activity.count({ where: { processId } });
      activity = await tx.activity.create({
        data: { processId, name: step.label, relatedStepId: stepId, order: count },
      });
    }

    if (code === null) {
      await tx.raciAssignment.deleteMany({ where: { activityId: activity.id, roleId } });
    } else {
      await tx.raciAssignment.upsert({
        where: { activityId_roleId: { activityId: activity.id, roleId } },
        update: { code },
        create: { activityId: activity.id, roleId, code },
      });
    }

    if (step.raciSkipped) {
      await tx.processStep.update({ where: { id: stepId }, data: { raciSkipped: false } });
    }

    return activity;
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${processId}/raci`);
  return ok({ activityId: activity.id });
}

const stepRaciSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  stepId: z.string().min(1),
});

/** Marks a Process Map step as intentionally not needing a RACI row. */
export async function skipStepRaci(
  input: z.infer<typeof stepRaciSchema>
): Promise<ActionResult<{ stepId: string }>> {
  const parsed = stepRaciSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const step = await prisma.processStep.findUnique({ where: { id: parsed.data.stepId } });
  if (!step || step.processId !== parsed.data.processId) return notFound();

  await prisma.processStep.update({ where: { id: step.id }, data: { raciSkipped: true } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/raci`);
  return ok({ stepId: step.id });
}

/** Reverses skipStepRaci — puts the step back in the pending queue. */
export async function unskipStepRaci(
  input: z.infer<typeof stepRaciSchema>
): Promise<ActionResult<{ stepId: string }>> {
  const parsed = stepRaciSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const step = await prisma.processStep.findUnique({ where: { id: parsed.data.stepId } });
  if (!step || step.processId !== parsed.data.processId) return notFound();

  await prisma.processStep.update({ where: { id: step.id }, data: { raciSkipped: false } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/raci`);
  return ok({ stepId: step.id });
}

/**
 * Loads the same unified row set the RACI table renders — every step (its
 * linked Activity if it has one, otherwise an empty assignable row) plus
 * any freestanding Activity — and shapes it for validateRaciMatrix. A
 * skipped step's row is excluded, same as it's excluded from the table's
 * "needs RACI" set. Used by both validateRaciMatrixAction and
 * finalizeRaciMatrix so finalizing is blocked by any unassigned,
 * unskipped step — not just ones that already happen to have an Activity.
 */
async function loadRaciActivities(processId: string): Promise<RaciActivity[]> {
  const [steps, activities] = await Promise.all([
    prisma.processStep.findMany({
      where: { processId },
      select: { id: true, type: true, label: true, raciSkipped: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.activity.findMany({
      where: { processId },
      include: { raciAssignments: true },
      orderBy: { order: "asc" },
    }),
  ]);

  const rows = buildRaciTableRows(
    steps,
    activities.map((a) => ({
      id: a.id,
      name: a.name,
      relatedStepId: a.relatedStepId,
      order: a.order,
      assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
    }))
  );

  return rows
    .filter((r) => !r.skipped)
    .map((r) => ({
      activityId: r.id,
      name: r.label,
      assignments: Object.entries(r.assignments).map(([roleId, code]) => ({ roleId, code })),
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
