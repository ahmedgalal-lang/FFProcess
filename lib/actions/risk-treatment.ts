"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { checkAssignableOwner } from "@/lib/data/owner-assignment";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";

/**
 * Risk treatment plans (spec 027): what the client will do about a risk —
 * reduce it, transfer it, accept it or avoid it — with the level it should
 * reach, and concrete treatment actions with owners and due dates. Any of it
 * counts as a hand edit, so the risk becomes hand-managed, the same as
 * updateGovernanceRisk already does for a score or status change.
 */

const LIKELIHOOD = z.enum(["LOW", "MEDIUM", "HIGH"]);
const IMPACT = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

async function findOwnedRisk(workspaceId: string, riskId: string) {
  const risk = await prisma.governanceRisk.findUnique({ where: { id: riskId } });
  return risk && risk.workspaceId === workspaceId ? risk : null;
}

async function findOwnedAction(workspaceId: string, actionId: string) {
  const action = await prisma.governanceRiskTreatmentAction.findUnique({
    where: { id: actionId },
    include: { risk: { select: { workspaceId: true } } },
  });
  return action && action.risk.workspaceId === workspaceId ? action : null;
}

const setTreatmentSchema = z.object({
  workspaceId: z.string().min(1),
  riskId: z.string().min(1),
  strategy: z.enum(["MITIGATE", "TRANSFER", "ACCEPT", "AVOID"]).nullable(),
  rationale: z.string().trim().max(4000).nullable(),
  targetLikelihood: LIKELIHOOD.nullable(),
  targetImpact: IMPACT.nullable(),
});

export async function setRiskTreatment(input: z.infer<typeof setTreatmentSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = setTreatmentSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedRisk(parsed.data.workspaceId, parsed.data.riskId))) return notFound();

  await prisma.governanceRisk.update({
    where: { id: parsed.data.riskId },
    data: {
      treatmentStrategy: parsed.data.strategy,
      treatmentRationale: parsed.data.rationale || null,
      targetLikelihood: parsed.data.targetLikelihood,
      targetImpact: parsed.data.targetImpact,
      handManaged: true,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: parsed.data.riskId });
}

const addActionSchema = z.object({
  workspaceId: z.string().min(1),
  riskId: z.string().min(1),
  description: z.string().trim().min(1).max(2000),
  ownerRoleId: z.string().min(1).nullable().optional(),
  ownerPersonId: z.string().min(1).nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
});

export async function addRiskTreatmentAction(input: z.infer<typeof addActionSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = addActionSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, riskId } = parsed.data;
  if (!(await findOwnedRisk(workspaceId, riskId))) return notFound();

  const ownerRoleId = parsed.data.ownerRoleId ?? null;
  const ownerPersonId = parsed.data.ownerPersonId ?? null;
  const ownerProblem = await checkAssignableOwner(workspaceId, ownerRoleId, ownerPersonId);
  if (ownerProblem) return ownerProblem;

  const action = await prisma.$transaction(async (tx) => {
    const created = await tx.governanceRiskTreatmentAction.create({
      data: {
        riskId,
        description: parsed.data.description,
        ownerRoleId,
        ownerPersonId,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      },
    });
    await tx.governanceRisk.update({ where: { id: riskId }, data: { handManaged: true } });
    return created;
  });

  revalidatePath(`/workspaces/${workspaceId}/governance`);
  return ok({ id: action.id });
}

const setDoneSchema = z.object({
  workspaceId: z.string().min(1),
  actionId: z.string().min(1),
  done: z.boolean(),
});

export async function setRiskTreatmentActionDone(input: z.infer<typeof setDoneSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = setDoneSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedAction(parsed.data.workspaceId, parsed.data.actionId))) return notFound();

  await prisma.governanceRiskTreatmentAction.update({
    where: { id: parsed.data.actionId },
    data: { doneAt: parsed.data.done ? new Date() : null },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: parsed.data.actionId });
}

const deleteActionSchema = z.object({
  workspaceId: z.string().min(1),
  actionId: z.string().min(1),
});

export async function deleteRiskTreatmentAction(input: z.infer<typeof deleteActionSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteActionSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedAction(parsed.data.workspaceId, parsed.data.actionId))) return notFound();

  await prisma.governanceRiskTreatmentAction.delete({ where: { id: parsed.data.actionId } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: parsed.data.actionId });
}
