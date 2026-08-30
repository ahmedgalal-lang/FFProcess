"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import {
  generateProcessCode,
  isCodeAvailable,
  wouldCreateBranchCycle,
  wouldCreateCycle,
} from "@/lib/domain/process-hierarchy";
import { validateConnections } from "@/lib/domain/process-graph";
import { assignSwimlanes, laneY, nextStepX, STEP_X_SPACING } from "@/lib/domain/process-layout";
import { arrangeByFlow, insertPositionAfter, moveStepInOrder } from "@/lib/domain/step-order";
import { ok, notFound, validationError, type ActionResult, type ActionError } from "@/lib/actions/errors";

/** Verifies processId actually belongs to workspaceId, not just that the caller can access workspaceId. */
async function loadProcessInWorkspace(workspaceId: string, processId: string) {
  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process || process.workspaceId !== workspaceId) return null;
  return process;
}

/**
 * Validates a "branches from" target: the step must exist, belong to a process
 * in this workspace, not belong to the branching process itself, and not close
 * a loop of processes each resuming from the next.
 *
 * Returns the owning process id on success so callers can reuse it.
 */
async function validateBranchSource(
  workspaceId: string,
  branchFromStepId: string,
  branchingProcessId: string | null
): Promise<{ ok: true; sourceProcessId: string } | { ok: false; error: ActionResult<never> }> {
  const step = await prisma.processStep.findUnique({
    where: { id: branchFromStepId },
    select: { id: true, processId: true, process: { select: { workspaceId: true } } },
  });
  if (!step || step.process.workspaceId !== workspaceId) {
    return { ok: false, error: notFound() as ActionResult<never> };
  }
  if (branchingProcessId && step.processId === branchingProcessId) {
    return {
      ok: false,
      error: validationError("A process can't branch from one of its own steps.") as ActionResult<never>,
    };
  }

  if (branchingProcessId) {
    const all = await prisma.process.findMany({
      where: { workspaceId },
      select: { id: true, branchFromStep: { select: { processId: true } } },
    });
    const branchSourceOf = new Map<string, string | null>(
      all.map((p) => [p.id, p.branchFromStep?.processId ?? null])
    );
    if (wouldCreateBranchCycle(branchingProcessId, step.processId, branchSourceOf)) {
      return {
        ok: false,
        error: validationError("That would make the process resume from itself, in a loop.") as ActionResult<never>,
      };
    }
  }

  return { ok: true, sourceProcessId: step.processId };
}

const createProcessSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  parentProcessId: z.string().min(1).optional().or(z.literal("")),
  categoryId: z.string().min(1).optional().or(z.literal("")),
  branchFromStepId: z.string().min(1).optional().or(z.literal("")),
});

const MAX_CODE_GENERATION_ATTEMPTS = 5;

/**
 * The Process Code is always auto-generated (FR-020) — never accepted from
 * the client — so there's nothing for a user to type or get wrong. Retries a
 * few times against a fresh code list in the rare case two creates race each
 * other to the same generated code.
 */
export async function createProcess(
  input: z.infer<typeof createProcessSchema>
): Promise<ActionResult<{ id: string; code: string }>> {
  const parsed = createProcessSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid process input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const parentProcessId = parsed.data.parentProcessId || undefined;
  const parent = parentProcessId
    ? await prisma.process.findUnique({ where: { id: parentProcessId }, select: { code: true } })
    : null;
  if (parentProcessId && !parent) return notFound();

  const categoryId = parsed.data.categoryId || undefined;
  if (categoryId) {
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: parsed.data.workspaceId } });
    const category = await prisma.processCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.firmId !== workspace.firmId) return notFound();
  }

  // No cycle check on create: the process doesn't exist yet, so it can't be
  // anywhere in a branch chain.
  const branchFromStepId = parsed.data.branchFromStepId || undefined;
  if (branchFromStepId) {
    const branch = await validateBranchSource(parsed.data.workspaceId, branchFromStepId, null);
    if (!branch.ok) return branch.error;
  }

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
    const existing = await prisma.process.findMany({
      where: { workspaceId: parsed.data.workspaceId },
      select: { code: true },
    });
    const code = generateProcessCode({
      name: parsed.data.name,
      parentCode: parent?.code ?? null,
      existingCodes: existing.map((p) => p.code),
    });
    if (!isCodeAvailable(code, existing.map((p) => p.code))) continue; // lost the race, retry

    try {
      const process = await prisma.process.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          code,
          name: parsed.data.name,
          description: parsed.data.description || undefined,
          parentProcessId,
          categoryId,
          branchFromStepId,
        },
      });
      revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes`);
      return ok({ id: process.id, code: process.code });
    } catch (error) {
      const isUniqueConflict =
        typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUniqueConflict || attempt === MAX_CODE_GENERATION_ATTEMPTS - 1) throw error;
    }
  }

  return validationError("Could not generate a unique Process Code — please try again.");
}

const cloneProcessSchema = z.object({
  workspaceId: z.string().min(1),
  sourceProcessId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  parentProcessId: z.string().min(1).optional().or(z.literal("")),
});

/**
 * Deep-copies a Process (steps, connections, cross-process links, RACI
 * activities and assignments) into a new Process in the same Workspace, with
 * a freshly auto-generated code. Same-workspace only — a cloned step's
 * assigned Role only means something if that Role exists where the clone
 * lands, and Roles aren't shared across Workspaces.
 */
export async function cloneProcess(
  input: z.infer<typeof cloneProcessSchema>
): Promise<ActionResult<{ id: string; code: string }>> {
  const parsed = cloneProcessSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const source = await prisma.process.findUnique({
    where: { id: parsed.data.sourceProcessId },
    include: {
      steps: { orderBy: { order: "asc" } },
      activities: { include: { raciAssignments: true } },
    },
  });
  if (!source || source.workspaceId !== parsed.data.workspaceId) return notFound();

  const parentProcessId = parsed.data.parentProcessId || undefined;
  const parent = parentProcessId
    ? await prisma.process.findUnique({ where: { id: parentProcessId }, select: { code: true } })
    : null;
  if (parentProcessId && !parent) return notFound();

  const sourceStepIds = source.steps.map((s) => s.id);
  const [connections, links] = await Promise.all([
    prisma.stepConnection.findMany({ where: { processId: source.id } }),
    prisma.processStepLink.findMany({ where: { stepId: { in: sourceStepIds } } }),
  ]);

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
    const existing = await prisma.process.findMany({
      where: { workspaceId: parsed.data.workspaceId },
      select: { code: true },
    });
    const code = generateProcessCode({
      name: parsed.data.name,
      parentCode: parent?.code ?? null,
      existingCodes: existing.map((p) => p.code),
    });
    if (!isCodeAvailable(code, existing.map((p) => p.code))) continue;

    try {
      const cloned = await prisma.$transaction(async (tx) => {
        const newProcess = await tx.process.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            code,
            name: parsed.data.name,
            description: source.description,
            parentProcessId,
            categoryId: source.categoryId,
          },
        });

        const stepIdMap = new Map<string, string>();
        for (const s of source.steps) {
          const newStep = await tx.processStep.create({
            data: {
              processId: newProcess.id,
              type: s.type,
              label: s.label,
              assignedRoleId: s.assignedRoleId,
              swimlaneRoleId: s.swimlaneRoleId,
              positionX: s.positionX,
              positionY: s.positionY,
              order: s.order,
            },
          });
          stepIdMap.set(s.id, newStep.id);
        }

        for (const c of connections) {
          await tx.stepConnection.create({
            data: {
              processId: newProcess.id,
              fromStepId: stepIdMap.get(c.fromStepId)!,
              toStepId: stepIdMap.get(c.toStepId)!,
              label: c.label,
            },
          });
        }

        for (const l of links) {
          await tx.processStepLink.create({
            data: { stepId: stepIdMap.get(l.stepId)!, targetProcessId: l.targetProcessId },
          });
        }

        for (const a of source.activities) {
          const newActivity = await tx.activity.create({
            data: {
              processId: newProcess.id,
              name: a.name,
              relatedStepId: a.relatedStepId ? stepIdMap.get(a.relatedStepId) : undefined,
              order: a.order,
            },
          });
          for (const ra of a.raciAssignments) {
            await tx.raciAssignment.create({
              data: { activityId: newActivity.id, roleId: ra.roleId, code: ra.code },
            });
          }
        }
        // RACI matrix status intentionally not cloned — a copy starts as an
        // unfinalized DRAFT even if the source was FINAL, since it's new,
        // unreviewed data.

        return newProcess;
      });

      revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes`);
      return ok({ id: cloned.id, code: cloned.code });
    } catch (error) {
      const isUniqueConflict =
        typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUniqueConflict || attempt === MAX_CODE_GENERATION_ATTEMPTS - 1) throw error;
    }
  }

  return validationError("Could not generate a unique Process Code — please try again.");
}

const updateProcessSchema = z.object({
  processId: z.string().min(1),
  workspaceId: z.string().min(1),
  code: z.string().trim().min(2).max(20).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  parentProcessId: z.string().min(1).nullable().optional(),
  branchFromStepId: z.string().min(1).nullable().optional(),
});

export async function updateProcess(
  input: z.infer<typeof updateProcessSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateProcessSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  if (parsed.data.categoryId) {
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: parsed.data.workspaceId } });
    const category = await prisma.processCategory.findUnique({ where: { id: parsed.data.categoryId } });
    if (!category || category.firmId !== workspace.firmId) return notFound();
  }

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

  if (parsed.data.branchFromStepId) {
    const branch = await validateBranchSource(
      parsed.data.workspaceId,
      parsed.data.branchFromStepId,
      parsed.data.processId
    );
    if (!branch.ok) return branch.error;
  }

  const updated = await prisma.process.update({
    where: { id: parsed.data.processId },
    data: {
      code: parsed.data.code ? parsed.data.code.trim().toUpperCase() : undefined,
      name: parsed.data.name,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId,
      parentProcessId: parsed.data.parentProcessId,
      branchFromStepId: parsed.data.branchFromStepId,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes`);
  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ id: updated.id });
}

const externalEntitySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
});

const updateProcessScopeSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  processPurpose: z.string().trim().max(2000).optional().or(z.literal("")),
  inScope: z.array(z.string().trim().min(1).max(200)).max(50),
  outOfScope: z.array(z.string().trim().min(1).max(200)).max(50),
  externalEntities: z.array(externalEntitySchema).max(50),
});

/**
 * Saves this process's documentation feeding the Export Report — Process
 * Purpose, In/Out-of-Scope, and External Entities — edited here on the
 * Process Map page rather than in the report itself, which is read-only.
 */
export async function updateProcessScope(
  input: z.infer<typeof updateProcessScopeSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateProcessScopeSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  const updated = await prisma.process.update({
    where: { id: parsed.data.processId },
    data: {
      processPurpose: parsed.data.processPurpose || null,
      inScope: parsed.data.inScope,
      outOfScope: parsed.data.outOfScope,
      externalEntities: parsed.data.externalEntities,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ id: updated.id });
}

const kpiSchema = z.object({
  metric: z.string().trim().min(1).max(120),
  target: z.string().trim().min(1).max(120),
  frequency: z.string().trim().min(1).max(120),
});

const updateProcessKpisSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  kpis: z.array(kpiSchema).max(50),
});

/** Saves this process's operational KPIs/SLAs — edited on the Process Map page, displayed read-only in the Export Report. */
export async function updateProcessKpis(
  input: z.infer<typeof updateProcessKpisSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateProcessKpisSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  const updated = await prisma.process.update({
    where: { id: parsed.data.processId },
    data: { kpis: parsed.data.kpis },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ id: updated.id });
}

const archiveProcessSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
});

/** Soft-deletes a Process — it drops off the Processes list but nothing under it is touched or destroyed. */
export async function archiveProcess(
  input: z.infer<typeof archiveProcessSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = archiveProcessSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  await prisma.process.update({
    where: { id: process.id },
    data: { archivedAt: new Date() },
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
  linkedProcessIds: z.array(z.string().min(1)).default([]),
});

const addStepSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  step: stepInputSchema.omit({ id: true }),
  fromStepId: z.string().min(1).optional(),
  connectionLabel: z.string().trim().max(60).optional().or(z.literal("")),
  /** Put the new step straight after this one; omit to append to the end. */
  insertAfterStepId: z.string().min(1).optional().or(z.literal("")),
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

  const { processId, step, fromStepId, connectionLabel, insertAfterStepId } = parsed.data;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, processId);
  if (!process) return notFound();

  const stepsInProcess = await prisma.processStep.findMany({
    where: { processId },
    select: { id: true, positionX: true, swimlaneRoleId: true, assignedRoleId: true, order: true },
    orderBy: { order: "asc" },
  });

  if (fromStepId) {
    const validIds = new Set(stepsInProcess.map((s) => s.id));
    if (!validIds.has(fromStepId)) return notFound();
  }

  // Auto-layout: reuse each Role's existing swimlane, assigning new lanes in
  // first-appearance order; place the new step to the right of the map.
  const laneOrder: string[] = [];
  for (const s of stepsInProcess) {
    const roleId = s.swimlaneRoleId ?? s.assignedRoleId;
    if (roleId && !laneOrder.includes(roleId)) laneOrder.push(roleId);
  }
  const resolvedRoleId = step.swimlaneRoleId || step.assignedRoleId || null;
  const positionX = nextStepX(stepsInProcess.map((s) => s.positionX));
  const positionY = laneY(resolvedRoleId, laneOrder);

  // Where it lands in the Steps List. The end by default, so adding a step
  // behaves as it always has, unless the caller says it belongs mid-flow.
  const orderedIds = stepsInProcess.map((s) => s.id);
  const position = insertPositionAfter(orderedIds, insertAfterStepId || null);

  const created = await prisma.$transaction(async (tx) => {
    // Make room: everything from the insertion point on moves down one.
    if (position < orderedIds.length) {
      await tx.processStep.updateMany({
        where: { processId, id: { in: orderedIds.slice(position) } },
        data: { order: { increment: 1 } },
      });
    }

    const newStep = await tx.processStep.create({
      data: {
        processId,
        type: step.type,
        label: step.label,
        assignedRoleId: step.assignedRoleId || undefined,
        swimlaneRoleId: step.swimlaneRoleId || undefined,
        positionX,
        positionY,
        order: position,
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

const addStepsBulkSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  labels: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
});

/**
 * Adds several plain TASK steps at once from a pasted list — one per line —
 * chaining each to the one before it (and the first to whatever was already
 * last in the map) so they show up as an editable draft chain immediately.
 * The caller is expected to go back through the Steps List editor afterward
 * to set each one's real type, role, and connector label.
 */
export async function addProcessStepsBulk(
  input: z.infer<typeof addStepsBulkSchema>
): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = addStepsBulkSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid step list", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { processId, labels } = parsed.data;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, processId);
  if (!process) return notFound();

  const stepsInProcess = await prisma.processStep.findMany({
    where: { processId },
    select: { id: true, positionX: true, swimlaneRoleId: true, assignedRoleId: true, order: true },
    orderBy: { order: "asc" },
  });

  const laneOrder: string[] = [];
  for (const s of stepsInProcess) {
    const roleId = s.swimlaneRoleId ?? s.assignedRoleId;
    if (roleId && !laneOrder.includes(roleId)) laneOrder.push(roleId);
  }
  const positionY = laneY(null, laneOrder);
  let nextX = nextStepX(stepsInProcess.map((s) => s.positionX));
  let previousStepId = stepsInProcess.at(-1)?.id;
  let nextOrder = stepsInProcess.length;

  const ids = await prisma.$transaction(async (tx) => {
    const createdIds: string[] = [];
    for (const label of labels) {
      const newStep = await tx.processStep.create({
        data: { processId, type: "TASK", label, positionX: nextX, positionY, order: nextOrder },
      });
      nextOrder += 1;
      if (previousStepId) {
        await tx.stepConnection.create({
          data: { processId, fromStepId: previousStepId, toStepId: newStep.id },
        });
      }
      previousStepId = newStep.id;
      nextX += STEP_X_SPACING;
      createdIds.push(newStep.id);
    }
    return createdIds;
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${processId}/map`);
  return ok({ ids });
}

const updateStepSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  stepId: z.string().min(1),
  type: z.enum(["START", "TASK", "DECISION", "END"]),
  label: z.string().trim().min(1).max(200),
  assignedRoleId: z.string().min(1).optional().or(z.literal("")),
  swimlaneRoleId: z.string().min(1).optional().or(z.literal("")),
  detailedAction: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  exceptionHandling: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * Edits an existing step's name, type, assigned/swimlane role, and its
 * Export Report documentation (Detailed Action, one entry per line, and
 * Exception Handling) — the report reads these fields directly rather than
 * offering its own editing UI, so this is their only home.
 */
export async function updateProcessStep(
  input: z.infer<typeof updateStepSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateStepSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid step input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  const step = await prisma.processStep.findUnique({ where: { id: parsed.data.stepId } });
  if (!step || step.processId !== parsed.data.processId) return notFound();

  const updated = await prisma.processStep.update({
    where: { id: parsed.data.stepId },
    data: {
      type: parsed.data.type,
      label: parsed.data.label,
      assignedRoleId: parsed.data.assignedRoleId || null,
      swimlaneRoleId: parsed.data.swimlaneRoleId || null,
      ...(parsed.data.detailedAction !== undefined ? { detailedAction: parsed.data.detailedAction } : {}),
      ...(parsed.data.exceptionHandling !== undefined
        ? { exceptionHandling: parsed.data.exceptionHandling || null }
        : {}),
    },
  });

  // A role change moves the step to a different lane, and can add or remove a
  // lane for every other step too, so the whole map's vertical placement is
  // recomputed rather than just this step's.
  await realignSwimlanes(parsed.data.processId);

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ id: updated.id });
}

const setStepMilestoneSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  stepId: z.string().min(1),
  milestone: z.boolean(),
});

/**
 * Marks a step as one of the few worth seeing from engagement level — the
 * beads on this process's rail in the Helicopter View. Its own action rather
 * than a field on the step editor because it's a one-click judgement made
 * while reading the list, not part of editing a step's content.
 */
export async function setStepMilestone(
  input: z.infer<typeof setStepMilestoneSchema>
): Promise<ActionResult<{ id: string; milestone: boolean }>> {
  const parsed = setStepMilestoneSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  const step = await prisma.processStep.findUnique({ where: { id: parsed.data.stepId } });
  if (!step || step.processId !== parsed.data.processId) return notFound();

  const updated = await prisma.processStep.update({
    where: { id: parsed.data.stepId },
    data: { milestone: parsed.data.milestone },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  revalidatePath(`/workspaces/${parsed.data.workspaceId}/helicopter`);
  return ok({ id: updated.id, milestone: updated.milestone });
}

const deleteStepSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  stepId: z.string().min(1),
});

/**
 * Removes a step entirely. Its connections and cross-process links cascade
 * with it; any Activity that referenced it as relatedStep just loses that
 * reference (FK is ON DELETE SET NULL) rather than being deleted itself.
 */
export async function deleteProcessStep(
  input: z.infer<typeof deleteStepSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteStepSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  const step = await prisma.processStep.findUnique({ where: { id: parsed.data.stepId } });
  if (!step || step.processId !== parsed.data.processId) return notFound();

  await prisma.processStep.delete({ where: { id: parsed.data.stepId } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ id: parsed.data.stepId });
}

const createConnectionSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  fromStepId: z.string().min(1),
  toStepId: z.string().min(1),
  label: z.string().trim().max(60).optional().or(z.literal("")),
});

/** Connects two existing steps by dragging between their handles on the canvas. */
export async function createStepConnection(
  input: z.infer<typeof createConnectionSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createConnectionSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid connection", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { processId, fromStepId, toStepId, label } = parsed.data;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, processId);
  if (!process) return notFound();

  const steps = await prisma.processStep.findMany({ where: { processId }, select: { id: true } });
  const validIds = new Set(steps.map((s) => s.id));
  const issues = validateConnections(
    [{ fromStepId, toStepId }],
    new Map(
      [...validIds].map((id) => [id, processId])
    )
  );
  if (!validIds.has(fromStepId) || !validIds.has(toStepId) || issues.length > 0) return notFound();

  const connection = await prisma.stepConnection.create({
    data: { processId, fromStepId, toStepId, label: label || undefined },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${processId}/map`);
  return ok({ id: connection.id });
}

const deleteConnectionSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  connectionId: z.string().min(1),
});

export async function deleteStepConnection(
  input: z.infer<typeof deleteConnectionSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteConnectionSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  const connection = await prisma.stepConnection.findUnique({ where: { id: parsed.data.connectionId } });
  if (!connection || connection.processId !== parsed.data.processId) return notFound();

  await prisma.stepConnection.delete({ where: { id: parsed.data.connectionId } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ id: parsed.data.connectionId });
}

const updateStepPositionSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  stepId: z.string().min(1),
  positionX: z.number(),
  positionY: z.number(),
  /**
   * Set when the drag crossed into another lane. A lane belongs to a Role, so
   * moving a step between lanes is the same thing as changing which Role's
   * lane it sits in; an empty string drops it into the unassigned lane.
   */
  swimlaneRoleId: z.string().optional(),
});

/** Persists a drag-to-reposition on the Process Map canvas (autosave, FR-017). */
export async function updateStepPosition(
  input: z.infer<typeof updateStepPositionSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateStepPositionSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid position", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  const existingStep = await prisma.processStep.findUnique({ where: { id: parsed.data.stepId } });
  if (!existingStep || existingStep.processId !== parsed.data.processId) return notFound();

  if (parsed.data.swimlaneRoleId) {
    const role = await prisma.role.findUnique({ where: { id: parsed.data.swimlaneRoleId } });
    if (!role || role.workspaceId !== parsed.data.workspaceId) return notFound();
  }

  const step = await prisma.processStep.update({
    where: { id: parsed.data.stepId },
    data: {
      positionX: parsed.data.positionX,
      positionY: parsed.data.positionY,
      ...(parsed.data.swimlaneRoleId === undefined
        ? {}
        : { swimlaneRoleId: parsed.data.swimlaneRoleId || null }),
    },
  });

  if (parsed.data.swimlaneRoleId !== undefined) {
    await realignSwimlanes(parsed.data.processId);
    revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  }

  return ok({ id: step.id });
}

/**
 * Rewrites every step's stored positionY to match the lane its Role puts it
 * in. The canvas derives lanes itself, so this isn't what makes the picture
 * correct — it keeps the stored value from drifting into disagreeing with what
 * is drawn, which is how steps ended up stranded in the wrong lane to begin
 * with. Horizontal position is left alone: that one really is the user's.
 */
async function realignSwimlanes(processId: string): Promise<void> {
  const steps = await prisma.processStep.findMany({
    where: { processId },
    select: { id: true, assignedRoleId: true, swimlaneRoleId: true, positionY: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const layout = assignSwimlanes(steps);
  const moved = steps.filter((s) => layout.yOf.get(s.id) !== s.positionY);
  if (moved.length === 0) return;

  await prisma.$transaction(
    moved.map((s) =>
      prisma.processStep.update({ where: { id: s.id }, data: { positionY: layout.yOf.get(s.id)! } })
    )
  );
}

/**
 * Writes an explicit position for every step of a process, in one statement per
 * step inside a transaction — the list is small (a map is tens of steps, not
 * thousands) and doing it as a unit means a half-applied order can't be seen.
 */
async function writeStepOrder(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  processId: string,
  orderedStepIds: string[]
): Promise<void> {
  for (const [index, id] of orderedStepIds.entries()) {
    await tx.processStep.update({ where: { id, processId }, data: { order: index } });
  }
}

/** The process's step ids in their current order, or null if it isn't reachable. */
async function loadOrderedStepIds(
  workspaceId: string,
  processId: string
): Promise<string[] | null> {
  const process = await loadProcessInWorkspace(workspaceId, processId);
  if (!process) return null;
  const steps = await prisma.processStep.findMany({
    where: { processId },
    select: { id: true },
    orderBy: { order: "asc" },
  });
  return steps.map((s) => s.id);
}

const moveStepSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  stepId: z.string().min(1),
  direction: z.enum(["UP", "DOWN"]),
});

/**
 * Moves one step one place up or down the Steps List. Connections are left
 * exactly as they are: this changes the order the steps are listed and
 * reported in, not what flows into what.
 */
export async function moveProcessStep(
  input: z.infer<typeof moveStepSchema>
): Promise<ActionResult<{ orderedStepIds: string[] }>> {
  const parsed = moveStepSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const orderedStepIds = await loadOrderedStepIds(parsed.data.workspaceId, parsed.data.processId);
  if (!orderedStepIds) return notFound();
  if (!orderedStepIds.includes(parsed.data.stepId)) return notFound();

  const next = moveStepInOrder(orderedStepIds, parsed.data.stepId, parsed.data.direction);
  await prisma.$transaction((tx) => writeStepOrder(tx, parsed.data.processId, next));

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ orderedStepIds: next });
}

const reorderStepsSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  orderedStepIds: z.array(z.string().min(1)).min(1),
});

/** Sets the whole list's order at once, from an explicit list of step ids. */
export async function reorderProcessSteps(
  input: z.infer<typeof reorderStepsSchema>
): Promise<ActionResult<{ orderedStepIds: string[] }>> {
  const parsed = reorderStepsSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const current = await loadOrderedStepIds(parsed.data.workspaceId, parsed.data.processId);
  if (!current) return notFound();

  // The new order has to be a rearrangement of exactly this process's steps —
  // anything else would silently drop a step off the list or renumber a step
  // belonging to another process.
  const submitted = new Set(parsed.data.orderedStepIds);
  const sameSet =
    submitted.size === parsed.data.orderedStepIds.length &&
    submitted.size === current.length &&
    current.every((id) => submitted.has(id));
  if (!sameSet) return validationError("That order doesn't match this process's steps.");

  await prisma.$transaction((tx) => writeStepOrder(tx, parsed.data.processId, parsed.data.orderedStepIds));

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ orderedStepIds: parsed.data.orderedStepIds });
}

const arrangeStepsSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
});

/**
 * Re-orders the Steps List to follow the connections — every step after
 * whatever leads into it. This is the one-click fix for a step added late:
 * it's already connected in the right place, it just isn't listed there.
 */
export async function arrangeProcessStepsByFlow(
  input: z.infer<typeof arrangeStepsSchema>
): Promise<ActionResult<{ orderedStepIds: string[] }>> {
  const parsed = arrangeStepsSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const orderedStepIds = await loadOrderedStepIds(parsed.data.workspaceId, parsed.data.processId);
  if (!orderedStepIds) return notFound();
  if (orderedStepIds.length === 0) return ok({ orderedStepIds });

  const connections = await prisma.stepConnection.findMany({
    where: { processId: parsed.data.processId },
    select: { fromStepId: true, toStepId: true },
  });

  const next = arrangeByFlow(orderedStepIds, connections);
  await prisma.$transaction((tx) => writeStepOrder(tx, parsed.data.processId, next));

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ orderedStepIds: next });
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

  const process = await loadProcessInWorkspace(parsed.data.workspaceId, parsed.data.processId);
  if (!process) return notFound();

  if (parsed.data.relatedStepId) {
    const relatedStep = await prisma.processStep.findUnique({ where: { id: parsed.data.relatedStepId } });
    if (!relatedStep || relatedStep.processId !== parsed.data.processId) return notFound();
  }

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
