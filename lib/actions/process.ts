"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { isCodeAvailable, wouldCreateCycle } from "@/lib/domain/process-hierarchy";
import { validateConnections } from "@/lib/domain/process-graph";
import { ok, notFound, validationError, type ActionResult, type ActionError } from "@/lib/actions/errors";

const createProcessSchema = z.object({
  workspaceId: z.string().min(1),
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  parentProcessId: z.string().min(1).optional().or(z.literal("")),
});

export async function createProcess(
  input: z.infer<typeof createProcessSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createProcessSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid process input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const existing = await prisma.process.findMany({
    where: { workspaceId: parsed.data.workspaceId },
    select: { code: true },
  });
  if (!isCodeAvailable(parsed.data.code, existing.map((p) => p.code))) {
    return validationError(`Process Code "${parsed.data.code}" is already used in this workspace.`);
  }

  const process = await prisma.process.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      code: parsed.data.code.trim().toUpperCase(),
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      parentProcessId: parsed.data.parentProcessId || undefined,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes`);
  return ok({ id: process.id });
}

const updateProcessSchema = z.object({
  processId: z.string().min(1),
  workspaceId: z.string().min(1),
  code: z.string().trim().min(2).max(20).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  parentProcessId: z.string().min(1).nullable().optional(),
});

export async function updateProcess(
  input: z.infer<typeof updateProcessSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateProcessSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const allProcesses = await prisma.process.findMany({
    where: { workspaceId: parsed.data.workspaceId },
    select: { id: true, code: true, parentProcessId: true },
  });

  if (parsed.data.code) {
    const others = allProcesses.filter((p) => p.id !== parsed.data.processId).map((p) => p.code);
    if (!isCodeAvailable(parsed.data.code, others)) {
      return validationError(`Process Code "${parsed.data.code}" is already used in this workspace.`);
    }
  }

  if (parsed.data.parentProcessId) {
    const parentOf = new Map(allProcesses.map((p) => [p.id, p.parentProcessId]));
    if (wouldCreateCycle(parsed.data.processId, parsed.data.parentProcessId, parentOf)) {
      return validationError("That parent selection would create a circular process hierarchy.");
    }
  }

  const process = await prisma.process.update({
    where: { id: parsed.data.processId },
    data: {
      code: parsed.data.code ? parsed.data.code.trim().toUpperCase() : undefined,
      name: parsed.data.name,
      description: parsed.data.description,
      parentProcessId: parsed.data.parentProcessId,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes`);
  return ok({ id: process.id });
}

const stepInputSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["START", "TASK", "DECISION", "END"]),
  label: z.string().trim().min(1).max(200),
  assignedRoleId: z.string().min(1).optional().or(z.literal("")),
  swimlaneRoleId: z.string().min(1).optional().or(z.literal("")),
  positionX: z.number(),
  positionY: z.number(),
  linkedProcessIds: z.array(z.string().min(1)).default([]),
});

const addStepSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  step: stepInputSchema.omit({ id: true }),
  fromStepId: z.string().min(1).optional(),
  connectionLabel: z.string().trim().max(60).optional().or(z.literal("")),
});

/**
 * Adds a single step to a Process Map and (optionally) a connection from an
 * existing step, autosaving immediately (FR-003, FR-004, FR-017, FR-021).
 */
export async function addProcessStep(
  input: z.infer<typeof addStepSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = addStepSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid step input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { processId, step, fromStepId, connectionLabel } = parsed.data;

  if (fromStepId) {
    const stepsInProcess = await prisma.processStep.findMany({
      where: { processId },
      select: { id: true },
    });
    const validIds = new Set(stepsInProcess.map((s) => s.id));
    const stepProcessId = new Map<string, string>();
    for (const id of validIds) stepProcessId.set(id, processId);
    if (!validIds.has(fromStepId)) return notFound();
  }

  const created = await prisma.$transaction(async (tx) => {
    const newStep = await tx.processStep.create({
      data: {
        processId,
        type: step.type,
        label: step.label,
        assignedRoleId: step.assignedRoleId || undefined,
        swimlaneRoleId: step.swimlaneRoleId || undefined,
        positionX: step.positionX,
        positionY: step.positionY,
        links: step.linkedProcessIds.length
          ? { create: step.linkedProcessIds.map((targetProcessId) => ({ targetProcessId })) }
          : undefined,
      },
    });

    if (fromStepId) {
      const issues = validateConnections(
        [{ fromStepId, toStepId: newStep.id }],
        new Map([
          [fromStepId, processId],
          [newStep.id, processId],
        ])
      );
      if (issues.length > 0) throw new Error("CROSS_PROCESS_CONNECTION");

      await tx.stepConnection.create({
        data: { processId, fromStepId, toStepId: newStep.id, label: connectionLabel || undefined },
      });
    }

    return newStep;
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${processId}/map`);
  return ok({ id: created.id });
}

const createActivitySchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  relatedStepId: z.string().min(1).optional().or(z.literal("")),
});

export async function createActivity(
  input: z.infer<typeof createActivitySchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createActivitySchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid activity input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const count = await prisma.activity.count({ where: { processId: parsed.data.processId } });

  const activity = await prisma.activity.create({
    data: {
      processId: parsed.data.processId,
      name: parsed.data.name,
      relatedStepId: parsed.data.relatedStepId || undefined,
      order: count,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/raci`);
  return ok({ id: activity.id });
}

export type { ActionError };
