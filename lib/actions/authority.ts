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

const DIRECTIONS = ["GREATER_THAN", "GREATER_OR_EQUAL", "LESS_THAN", "LESS_OR_EQUAL", "EQUAL_NO_APPROVAL"] as const;

/**
 * The invariants a rule has to satisfy, enforced here at the boundary rather
 * than only in the database (Constitution Principle I).
 *
 * The measure is the one that matters: a MONEY rule carries an amount and no
 * days, a TIME rule the reverse. Enforcing it server-side is what stops a
 * client that forgets to clear the other figure persisting a stale one, which
 * is exactly the bug FR-003 exists to prevent.
 */
const ruleShapeSchema = z
  .object({
    measure: z.enum(["MONEY", "TIME", "NONE"]),
    amount: z.number().nonnegative().nullable(),
    days: z.number().int().nonnegative().max(3650).nullable(),
    direction: z.enum(DIRECTIONS),
    consequence: z.enum(["APPROVAL", "ESCALATION"]),
    whoRoleId: z.string().min(1).nullable(),
    whoPersonId: z.string().min(1).nullable(),
  })
  .refine((v) => !(v.whoRoleId && v.whoPersonId), {
    message: "Choose a Role or a Person, not both",
  })
  .refine((v) => v.measure !== "MONEY" || v.days === null, {
    message: "A money rule cannot carry a turnaround",
  })
  .refine((v) => v.measure !== "TIME" || v.amount === null, {
    message: "A time rule cannot carry an amount",
  })
  .refine((v) => v.measure !== "NONE" || (v.amount === null && v.days === null), {
    message: "A task with no rule carries no figure",
  })
  .refine((v) => v.measure !== "NONE" || v.direction === "EQUAL_NO_APPROVAL", {
    message: "A task with no rule must use the no-approval direction",
  });

const addRuleSchema = rowRefSchema;
const updateRuleSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  ruleId: z.string().min(1),
  rule: ruleShapeSchema,
});
const deleteRuleSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  ruleId: z.string().min(1),
});

/** Confirms a role or person belongs to this workspace before it is stored on a rule. */
async function whoBelongsToWorkspace(
  workspaceId: string,
  whoRoleId: string | null,
  whoPersonId: string | null
): Promise<boolean> {
  if (whoRoleId) {
    const role = await prisma.role.findUnique({ where: { id: whoRoleId } });
    if (!role || role.workspaceId !== workspaceId) return false;
  }
  if (whoPersonId) {
    const person = await prisma.person.findUnique({ where: { id: whoPersonId } });
    if (!person || person.workspaceId !== workspaceId) return false;
  }
  return true;
}

/**
 * Adds an empty rule to a task, creating the task's assignment row if it does
 * not have one yet. New rules land at the end of the list, which is what makes
 * the displayed order stable and predictable (FR-013).
 */
export async function addAuthorityRule(
  input: z.infer<typeof addRuleSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = addRuleSchema.safeParse(input);
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
    update: {},
    create: { processId, activityId: row.activityId, stepId: row.stepId, skipped: false },
  });

  const last = await prisma.authorityRule.findFirst({
    where: { assignmentId: assignment.id },
    orderBy: { order: "desc" },
  });

  const rule = await prisma.authorityRule.create({
    data: { assignmentId: assignment.id, order: (last?.order ?? -1) + 1 },
  });

  revalidatePath(`/workspaces/${workspaceId}/processes/${processId}/authority`);
  return ok({ id: rule.id });
}

/**
 * Saves one rule. Switching the measure clears the figure belonging to the
 * other one here rather than trusting the client to, so a rule can never be
 * stored carrying both an amount and a turnaround.
 */
export async function updateAuthorityRule(
  input: z.infer<typeof updateRuleSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateRuleSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, processId, ruleId, rule } = parsed.data;

  const process = await loadProcessInWorkspace(workspaceId, processId);
  if (!process) return notFound();

  const existing = await prisma.authorityRule.findUnique({
    where: { id: ruleId },
    include: { assignment: true },
  });
  if (!existing || existing.assignment.processId !== processId) return notFound();

  if (!(await whoBelongsToWorkspace(workspaceId, rule.whoRoleId, rule.whoPersonId))) return notFound();

  const noRule = rule.measure === "NONE";
  await prisma.authorityRule.update({
    where: { id: ruleId },
    data: {
      measure: rule.measure,
      amount: rule.measure === "MONEY" ? rule.amount : null,
      days: rule.measure === "TIME" ? rule.days : null,
      direction: rule.direction,
      consequence: rule.consequence,
      whoRoleId: noRule ? null : rule.whoRoleId,
      whoPersonId: noRule ? null : rule.whoPersonId,
    },
  });

  revalidatePath(`/workspaces/${workspaceId}/processes/${processId}/authority`);
  return ok({ id: ruleId });
}

/** Removes one rule. The task keeps its other rules, and may end up with none. */
export async function deleteAuthorityRule(
  input: z.infer<typeof deleteRuleSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteRuleSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, processId, ruleId } = parsed.data;

  const process = await loadProcessInWorkspace(workspaceId, processId);
  if (!process) return notFound();

  const existing = await prisma.authorityRule.findUnique({
    where: { id: ruleId },
    include: { assignment: true },
  });
  if (!existing || existing.assignment.processId !== processId) return notFound();

  await prisma.authorityRule.delete({ where: { id: ruleId } });

  revalidatePath(`/workspaces/${workspaceId}/processes/${processId}/authority`);
  return ok({ id: ruleId });
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
