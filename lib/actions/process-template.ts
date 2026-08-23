"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { generateProcessCode, isCodeAvailable } from "@/lib/domain/process-hierarchy";
import { laneY, nextStepX, FIRST_STEP_X } from "@/lib/domain/process-layout";
import { runProcessTemplateGeneration, type ProcessTemplateResult } from "@/lib/ai/process-template";
import { ok, notFound, validationError, aiUnavailable, type ActionResult } from "@/lib/actions/errors";

const generateSchema = z.object({
  workspaceId: z.string().min(1),
  processName: z.string().trim().min(1).max(120),
});

/**
 * Drafts a best-practice Process Map + RACI matrix using the workspace's
 * industry/description as context. Returns the draft for review — nothing
 * is persisted until createProcessFromTemplate is called with the (possibly
 * edited) result.
 */
export async function generateProcessTemplateDraft(
  input: z.infer<typeof generateSchema>
): Promise<ActionResult<ProcessTemplateResult>> {
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: parsed.data.workspaceId } });

  const promptLines = [
    `Draft a process named or about: "${parsed.data.processName}".`,
    `Client: ${workspace.name}`,
    workspace.industry ? `Industry / sector: ${workspace.industry}` : "Industry / sector: not specified.",
    workspace.description ? `Background: ${workspace.description}` : "No further background provided.",
  ];

  const outcome = await runProcessTemplateGeneration(promptLines.join("\n"));
  if (!outcome.ok) {
    if (outcome.reason === "NOT_CONFIGURED") return aiUnavailable(outcome.message);
    return validationError(outcome.message);
  }

  return ok(outcome.data);
}

const templateStepSchema = z.object({
  type: z.enum(["START", "TASK", "DECISION", "END"]),
  label: z.string().trim().min(1).max(200),
  roleName: z.string().trim().max(80).optional().or(z.literal("")),
});

const templateActivitySchema = z.object({
  name: z.string().trim().min(1).max(160),
  assignments: z
    .array(
      z.object({
        roleName: z.string().trim().min(1).max(80),
        code: z.enum(["RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"]),
      })
    )
    .default([]),
});

const createFromTemplateSchema = z.object({
  workspaceId: z.string().min(1),
  processName: z.string().trim().min(1).max(120),
  categoryId: z.string().min(1).optional().or(z.literal("")),
  parentProcessId: z.string().min(1).optional().or(z.literal("")),
  steps: z.array(templateStepSchema).min(1).max(40),
  activities: z.array(templateActivitySchema).max(40).default([]),
});

const MAX_CODE_GENERATION_ATTEMPTS = 5;

/**
 * Materializes an (optionally edited) generated draft into a real Process —
 * steps chained in the given order, RACI activities and assignments, and
 * Roles resolved by name (matching an existing Role in this workspace, or
 * creating one) since the draft only knows role/title names, not real ids.
 */
export async function createProcessFromTemplate(
  input: z.infer<typeof createFromTemplateSchema>
): Promise<ActionResult<{ id: string; code: string }>> {
  const parsed = createFromTemplateSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, steps, activities } = parsed.data;

  const parentProcessId = parsed.data.parentProcessId || undefined;
  const parent = parentProcessId
    ? await prisma.process.findUnique({ where: { id: parentProcessId }, select: { code: true } })
    : null;
  if (parentProcessId && !parent) return notFound();

  const categoryId = parsed.data.categoryId || undefined;
  if (categoryId) {
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const category = await prisma.processCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.firmId !== workspace.firmId) return notFound();
  }

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
    const existing = await prisma.process.findMany({ where: { workspaceId }, select: { code: true } });
    const code = generateProcessCode({
      name: parsed.data.processName,
      parentCode: parent?.code ?? null,
      existingCodes: existing.map((p) => p.code),
    });
    if (!isCodeAvailable(code, existing.map((p) => p.code))) continue;

    try {
      const process = await prisma.$transaction(async (tx) => {
        const roleIdByName = new Map<string, string>();
        async function resolveRoleId(name: string): Promise<string> {
          const key = name.trim();
          const cached = roleIdByName.get(key.toLowerCase());
          if (cached) return cached;
          const existingRole = await tx.role.findFirst({
            where: { workspaceId, name: key, archivedAt: null },
          });
          const roleId = existingRole ? existingRole.id : (await tx.role.create({ data: { workspaceId, name: key } })).id;
          roleIdByName.set(key.toLowerCase(), roleId);
          return roleId;
        }

        const newProcess = await tx.process.create({
          data: { workspaceId, code, name: parsed.data.processName, parentProcessId, categoryId },
        });

        const laneOrder: string[] = [];
        const usedX: number[] = [];
        let previousStepId: string | undefined;

        for (const s of steps) {
          const roleId = s.roleName ? await resolveRoleId(s.roleName) : undefined;
          if (roleId && !laneOrder.includes(roleId)) laneOrder.push(roleId);
          const positionX = usedX.length === 0 ? FIRST_STEP_X : nextStepX(usedX);
          usedX.push(positionX);
          const positionY = laneY(roleId ?? null, laneOrder);

          const newStep = await tx.processStep.create({
            data: {
              processId: newProcess.id,
              type: s.type,
              label: s.label,
              assignedRoleId: roleId,
              swimlaneRoleId: roleId,
              positionX,
              positionY,
            },
          });
          if (previousStepId) {
            await tx.stepConnection.create({
              data: { processId: newProcess.id, fromStepId: previousStepId, toStepId: newStep.id },
            });
          }
          previousStepId = newStep.id;
        }

        for (const [i, a] of activities.entries()) {
          const newActivity = await tx.activity.create({
            data: { processId: newProcess.id, name: a.name, order: i },
          });
          for (const asn of a.assignments) {
            const roleId = await resolveRoleId(asn.roleName);
            await tx.raciAssignment.create({
              data: { activityId: newActivity.id, roleId, code: asn.code },
            });
          }
        }

        return newProcess;
      });

      revalidatePath(`/workspaces/${workspaceId}/processes`);
      return ok({ id: process.id, code: process.code });
    } catch (error) {
      const isUniqueConflict =
        typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUniqueConflict || attempt === MAX_CODE_GENERATION_ATTEMPTS - 1) throw error;
    }
  }

  return validationError("Could not generate a unique Process Code — please try again.");
}
