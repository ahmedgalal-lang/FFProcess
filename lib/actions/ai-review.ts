"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { validateRaciMatrix } from "@/lib/domain/raci-validation";
import { buildAuthorityTableRows, validateAuthorityTable } from "@/lib/domain/authority-table";
import { findStructuralGaps, buildProcessReviewPrompt } from "@/lib/domain/process-review";
import {
  normalizeFindingTitle,
  partitionNewFindings,
  appendReviewNote,
  toPersistedFinding,
  type PersistedReviewFinding,
} from "@/lib/domain/review-findings";
import { runProcessReview } from "@/lib/ai/process-review";
import { ok, notFound, validationError, aiUnavailable, type ActionResult } from "@/lib/actions/errors";
import type { ReviewFindingCategory, ReviewFindingArea, ReviewFindingSeverity } from "@/app/generated/prisma/client";

export type { PersistedReviewFinding } from "@/lib/domain/review-findings";

const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const reviewProcessSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
});

/**
 * Gathers a Process's Map, RACI matrix, and this Process's Authority Matrix
 * (plus the workspace's industry/background notes, for sector-aware
 * findings), asks Claude to review it end to end, and persists any genuinely
 * new findings as ReviewFinding rows scoped to this process. A finding the
 * user already dismissed on this process won't be re-created even if a later
 * run rediscovers the same issue; a finding already being tracked (open,
 * edited, or integrated) is left as-is rather than duplicated. Read-only —
 * any Workspace member (VIEWER+) can run it, same as the export routes.
 */
export async function reviewProcessWithAI(
  input: z.infer<typeof reviewProcessSchema>
): Promise<ActionResult<{ summary: string; findings: PersistedReviewFinding[] }>> {
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

  const [steps, connections, activities, matrixStatus, roles, people, authorityAssignments, existingFindings] =
    await Promise.all([
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
      prisma.role.findMany({ where: { workspaceId } }),
      prisma.person.findMany({ where: { workspaceId } }),
      prisma.authorityAssignment.findMany({ where: { processId } }),
      prisma.reviewFinding.findMany({ where: { processId }, include: { integratedStep: true } }),
    ]);

  const stepLabelById = new Map(steps.map((s) => [s.id, s.label]));

  const raciActivities = activities.map((a) => ({
    activityId: a.id,
    name: a.name,
    assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
  }));
  const raciIssues = validateRaciMatrix(raciActivities);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));
  const authorityRows = buildAuthorityTableRows(
    steps.map((s) => ({ id: s.id, type: s.type, label: s.label })),
    activities.map((a) => ({ id: a.id, name: a.name, relatedStepId: a.relatedStepId, order: a.order })),
    authorityAssignments.map((a) => ({
      ...a,
      threshold: a.threshold === null ? null : Number(a.threshold),
      coApprovalAboveThreshold: a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
    }))
  );
  const authorityIssues = validateAuthorityTable(authorityRows);
  const authorityRowsForPrompt = authorityRows.map((r) => ({
    rowId: r.id,
    label: r.label,
    skipped: r.skipped,
    unit: r.unit,
    threshold: r.threshold,
    approverLabel: r.approverRoleId
      ? (roleNameById.get(r.approverRoleId) ?? null)
      : r.approverPersonId
        ? (personNameById.get(r.approverPersonId) ?? null)
        : null,
    coApprovalAboveThreshold: r.coApprovalAboveThreshold,
    coApproverLabel: r.coApproverRoleId ? (roleNameById.get(r.coApproverRoleId) ?? null) : null,
  }));

  const structuralGaps = findStructuralGaps(
    steps.map((s) => ({ id: s.id, type: s.type, label: s.label })),
    connections.map((c) => ({ fromStepId: c.fromStepId, toStepId: c.toStepId }))
  );

  const promptText = buildProcessReviewPrompt({
    workspaceName: workspace.name,
    workspaceIndustry: workspace.industry,
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
      rows: authorityRowsForPrompt,
      issues: authorityIssues,
    },
    structuralGaps,
  });

  const outcome = await runProcessReview(promptText);
  if (!outcome.ok) {
    if (outcome.reason === "NOT_CONFIGURED") return aiUnavailable(outcome.message);
    return validationError(outcome.message);
  }

  const dismissedTitles = new Set(
    existingFindings.filter((f) => f.status === "DISMISSED").map((f) => normalizeFindingTitle(f.title))
  );
  const trackedTitles = new Set(
    existingFindings.filter((f) => f.status !== "DISMISSED").map((f) => normalizeFindingTitle(f.title))
  );
  const newFindings = partitionNewFindings(outcome.data.findings, dismissedTitles, trackedTitles);

  if (newFindings.length > 0) {
    await prisma.reviewFinding.createMany({
      data: newFindings.map((f) => ({
        processId,
        category: f.category.toUpperCase() as ReviewFindingCategory,
        area: f.area.toUpperCase() as ReviewFindingArea,
        severity: f.severity.toUpperCase() as ReviewFindingSeverity,
        title: f.title,
        description: f.description,
        recommendation: f.recommendation,
      })),
    });
  }

  const allFindings = await prisma.reviewFinding.findMany({
    where: { processId, status: { not: "DISMISSED" } },
    include: { integratedStep: true },
  });
  allFindings.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return sev !== 0 ? sev : a.createdAt.getTime() - b.createdAt.getTime();
  });

  revalidatePath(`/workspaces/${workspaceId}/processes/${processId}/review`);
  return ok({ summary: outcome.data.summary, findings: allFindings.map(toPersistedFinding) });
}

const findingIdSchema = z.object({
  workspaceId: z.string().min(1),
  findingId: z.string().min(1),
});

/**
 * Loads a finding and its owning process, checking both belong to the given
 * workspace. Shared by every action below that mutates a single finding.
 */
async function loadFindingInWorkspace(workspaceId: string, findingId: string) {
  const finding = await prisma.reviewFinding.findUnique({
    where: { id: findingId },
    include: { process: true },
  });
  if (!finding || finding.process.workspaceId !== workspaceId) return null;
  return finding;
}

const updateFindingSchema = findingIdSchema.extend({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  recommendation: z.string().trim().min(1).max(1000),
});

/** Edits a finding's text. Only open/already-edited findings can be edited. */
export async function updateReviewFinding(
  input: z.infer<typeof updateFindingSchema>
): Promise<ActionResult<PersistedReviewFinding>> {
  const parsed = updateFindingSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const finding = await loadFindingInWorkspace(parsed.data.workspaceId, parsed.data.findingId);
  if (!finding) return notFound();
  if (finding.status !== "OPEN" && finding.status !== "EDITED") {
    return validationError("Only open findings can be edited.");
  }

  const { title, description, recommendation } = parsed.data;
  const updated = await prisma.reviewFinding.update({
    where: { id: finding.id },
    data: { title, description, recommendation, status: "EDITED" },
    include: { integratedStep: true },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${finding.processId}/review`);
  return ok(toPersistedFinding(updated));
}

/**
 * Dismisses a finding permanently for this process: soft-deleted from view,
 * and excluded from future AI review runs even if the same issue resurfaces
 * (matched by normalized title). If the finding was already integrated into
 * the Process Map, that change to the map is not reverted.
 */
export async function deleteReviewFinding(
  input: z.infer<typeof findingIdSchema>
): Promise<ActionResult<{ findingId: string }>> {
  const parsed = findingIdSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const finding = await loadFindingInWorkspace(parsed.data.workspaceId, parsed.data.findingId);
  if (!finding) return notFound();

  await prisma.reviewFinding.update({ where: { id: finding.id }, data: { status: "DISMISSED" } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${finding.processId}/review`);
  return ok({ findingId: finding.id });
}

const integrateFindingSchema = findingIdSchema.extend({
  stepId: z.string().min(1),
  mode: z.enum(["MERGED", "REPLACED"]),
});

/**
 * Pushes a finding's recommendation into the Process Map. MERGED appends it
 * as a note on the target step, leaving the step's label, connections, and
 * RACI assignments untouched. REPLACED overwrites the step's label with the
 * finding's title and its notes with the recommendation — the old label is
 * gone, but the step keeps its id, so its connections and RACI assignments
 * carry over unchanged.
 */
export async function integrateReviewFinding(
  input: z.infer<typeof integrateFindingSchema>
): Promise<ActionResult<PersistedReviewFinding>> {
  const parsed = integrateFindingSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const finding = await loadFindingInWorkspace(parsed.data.workspaceId, parsed.data.findingId);
  if (!finding) return notFound();
  if (finding.status === "DISMISSED") return validationError("A dismissed finding can't be integrated.");

  const step = await prisma.processStep.findUnique({ where: { id: parsed.data.stepId } });
  if (!step || step.processId !== finding.processId) return notFound();

  const { mode } = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    if (mode === "MERGED") {
      await tx.processStep.update({
        where: { id: step.id },
        data: { reviewNotes: appendReviewNote(step.reviewNotes, finding.recommendation) },
      });
    } else {
      await tx.processStep.update({
        where: { id: step.id },
        data: { label: finding.title, reviewNotes: finding.recommendation },
      });
    }

    return tx.reviewFinding.update({
      where: { id: finding.id },
      data: { status: "INTEGRATED", integratedStepId: step.id, integrationMode: mode },
      include: { integratedStep: true },
    });
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${finding.processId}/review`);
  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${finding.processId}/map`);
  return ok(toPersistedFinding(updated));
}
