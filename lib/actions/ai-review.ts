"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { validateRaciMatrix } from "@/lib/domain/raci-validation";
import { validateApprovalRules } from "@/lib/domain/authority-resolution";
import { findStructuralGaps, buildProcessReviewPrompt } from "@/lib/domain/process-review";
import { runProcessReview, type ProcessReviewResult } from "@/lib/ai/process-review";
import { ok, notFound, validationError, aiUnavailable, type ActionResult } from "@/lib/actions/errors";

const reviewProcessSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
});

/**
 * Gathers a Process's Map, RACI matrix, and the workspace's Authority Matrix,
 * then asks Claude to review it end to end for gaps and risks. Read-only —
 * any Workspace member (VIEWER+) can run it, same as the export routes.
 */
export async function reviewProcessWithAI(
  input: z.infer<typeof reviewProcessSchema>
): Promise<ActionResult<ProcessReviewResult>> {
  const parsed = reviewProcessSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "VIEWER");
  if (!access.ok) return access;

  const { workspaceId, processId } = parsed.data;

  const [workspace, process] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
    prisma.process.findUnique({ where: { id: processId } }),
  ]);
  if (!workspace || !process || process.workspaceId !== workspaceId) return notFound();

  const [steps, connections, activities, matrixStatus, decisionTypes] = await Promise.all([
    prisma.processStep.findMany({
      where: { processId },
      include: { assignedRole: true, swimlaneRole: true, links: { include: { targetProcess: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.stepConnection.findMany({ where: { processId } }),
    prisma.activity.findMany({
      where: { processId },
      include: { raciAssignments: { include: { role: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.raciMatrixStatus.findUnique({ where: { processId } }),
    prisma.decisionType.findMany({
      where: { workspaceId },
      include: { rules: { include: { approverRole: true, approverPerson: true, coApproverRole: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const stepLabelById = new Map(steps.map((s) => [s.id, s.label]));

  const raciActivities = activities.map((a) => ({
    activityId: a.id,
    name: a.name,
    assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
  }));
  const raciIssues = validateRaciMatrix(raciActivities);

  const authorityRules = decisionTypes.flatMap((dt) =>
    dt.rules.map((r) => ({
      id: r.id,
      approverLabel: r.approverRole?.name ?? r.approverPerson?.name ?? "Unknown",
      maxThreshold: Number(r.maxThreshold),
      coApprovalAboveThreshold: r.coApprovalAboveThreshold ? Number(r.coApprovalAboveThreshold) : null,
      coApproverLabel: r.coApproverRole?.name ?? null,
    }))
  );
  const authorityConflicts = validateApprovalRules(authorityRules);

  const structuralGaps = findStructuralGaps(
    steps.map((s) => ({ id: s.id, type: s.type, label: s.label })),
    connections.map((c) => ({ fromStepId: c.fromStepId, toStepId: c.toStepId }))
  );

  const promptText = buildProcessReviewPrompt({
    workspaceName: workspace.name,
    processCode: process.code,
    processName: process.name,
    processDescription: process.description,
    steps: steps.map((s) => ({
      type: s.type,
      label: s.label,
      assignedRoleName: s.assignedRole?.name ?? null,
      swimlaneRoleName: s.swimlaneRole?.name ?? null,
      linkedProcessCodes: s.links.map((l) => l.targetProcess.code),
    })),
    connections: connections.map((c) => ({
      fromLabel: stepLabelById.get(c.fromStepId) ?? c.fromStepId,
      toLabel: stepLabelById.get(c.toStepId) ?? c.toStepId,
      connectionLabel: c.label,
    })),
    raci: {
      matrixStatus: matrixStatus?.status ?? "DRAFT",
      activities: activities.map((a) => ({
        id: a.id,
        name: a.name,
        assignments: a.raciAssignments.map((ra) => ({ roleName: ra.role.name, code: ra.code })),
      })),
      issues: raciIssues,
    },
    authority: {
      decisionTypes: decisionTypes.map((dt) => ({
        name: dt.name,
        rules: dt.rules.map((r) => ({
          approverLabel: r.approverRole?.name ?? r.approverPerson?.name ?? "Unknown",
          maxThreshold: Number(r.maxThreshold),
          coApproverLabel: r.coApproverRole?.name ?? null,
        })),
      })),
      conflicts: authorityConflicts,
    },
    structuralGaps,
  });

  const outcome = await runProcessReview(promptText);
  if (!outcome.ok) {
    if (outcome.reason === "NOT_CONFIGURED") return aiUnavailable(outcome.message);
    return validationError(outcome.message);
  }

  return ok(outcome.data);
}
