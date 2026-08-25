"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { buildAuthorityTableRows } from "@/lib/domain/authority-table";
import { buildCombinedMatrixRows, buildProcessReportPrompt } from "@/lib/domain/process-report";
import { draftProcessReportNarrative, type ProcessReportDraft } from "@/lib/ai/process-report";
import { ok, notFound, validationError, aiUnavailable, type ActionResult } from "@/lib/actions/errors";

const draftReportSchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
});

/**
 * Drafts the narrative sections (Process Purpose, Scope, per-task Detailed
 * Action/Exception Handling, External Entities, KPIs) of this Process's
 * documentation report from its real Process Map/RACI/Authority data.
 * Read-only, VIEWER+ — same access level as AI Review, since this doesn't
 * change any data, just drafts text for the caller to review and edit before
 * export. The draft itself isn't persisted: it's regenerated each time,
 * same as AI Review's on-demand run.
 */
export async function draftProcessReportSections(
  input: z.infer<typeof draftReportSchema>
): Promise<ActionResult<ProcessReportDraft>> {
  const parsed = draftReportSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "VIEWER");
  if (!access.ok) return access;

  const { workspaceId, processId } = parsed.data;

  const [workspace, process] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
    prisma.process.findUnique({ where: { id: processId } }),
  ]);
  if (!workspace || !process || process.workspaceId !== workspaceId) return notFound();

  const [steps, activities, authorityAssignments] = await Promise.all([
    prisma.processStep.findMany({
      where: { processId },
      select: { id: true, type: true, label: true, raciSkipped: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.activity.findMany({
      where: { processId },
      include: { raciAssignments: { include: { role: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.authorityAssignment.findMany({ where: { processId } }),
  ]);

  const raciRows = buildRaciTableRows(
    steps,
    activities.map((a) => ({
      id: a.id,
      name: a.name,
      relatedStepId: a.relatedStepId,
      order: a.order,
      assignments: a.raciAssignments.map((ra) => ({ roleId: ra.roleId, code: ra.code })),
    }))
  );
  const authorityRows = buildAuthorityTableRows(
    steps,
    activities.map((a) => ({ id: a.id, name: a.name, relatedStepId: a.relatedStepId, order: a.order })),
    authorityAssignments.map((a) => ({
      ...a,
      threshold: a.threshold === null ? null : Number(a.threshold),
      coApprovalAboveThreshold: a.coApprovalAboveThreshold === null ? null : Number(a.coApprovalAboveThreshold),
    }))
  );
  const combinedRows = buildCombinedMatrixRows(raciRows, authorityRows);

  const roleNameByActivityRow = new Map(
    activities.map((a) => [a.id, a.raciAssignments.map((ra) => `${ra.role.name}=${ra.code}`).join(", ")])
  );

  const promptText = buildProcessReportPrompt({
    workspaceName: workspace.name,
    workspaceIndustry: workspace.industry,
    processCode: process.code,
    processName: process.name,
    processDescription: process.description,
    rows: combinedRows.map((row) => ({
      rowId: row.rowId,
      label: row.label,
      raciSummary: roleNameByActivityRow.get(row.rowId) || "no RACI assignments",
      authoritySummary:
        row.threshold === null
          ? null
          : `${row.unit === "MONEY" ? `up to $${row.threshold.toLocaleString()}` : `up to ${row.threshold} day(s)`}`,
    })),
  });

  const outcome = await draftProcessReportNarrative(promptText);
  if (!outcome.ok) {
    if (outcome.reason === "NOT_CONFIGURED") return aiUnavailable(outcome.message);
    return validationError(outcome.message);
  }

  return ok(outcome.data);
}
