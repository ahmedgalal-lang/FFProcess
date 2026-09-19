"use server";

import ExcelJS from "exceljs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { generateProcessCode } from "@/lib/domain/process-hierarchy";
import { assignSwimlanes, laneY, FIRST_STEP_X, STEP_X_SPACING } from "@/lib/domain/process-layout";
import {
  parseWorkbook,
  type ImportPlan,
  type ImportProblem,
} from "@/lib/domain/process-import";
import { ok, validationError, type ActionResult } from "@/lib/actions/errors";

/** Same ceiling the value-chain importer uses; a template is far smaller. */
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export type ImportSummary = {
  processName: string;
  /** Drives the warning that a separate process will be created. */
  nameAlreadyExists: boolean;
  stepCount: number;
  connectionCount: number;
  raciCount: number;
  authorityRuleCount: number;
  kpiCount: number;
  externalEntityCount: number;
  existingRoles: string[];
  newRoles: string[];
  existingPeople: string[];
  newPeople: string[];
  problems: ImportProblem[];
};

const importSchema = z.object({
  workspaceId: z.string().min(1),
  dryRun: z.boolean(),
});

/** Case-insensitive lookup, so "Sector Owner" and "SECTOR OWNER" are one thing. */
function findByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const wanted = name.trim().toLowerCase();
  return items.find((item) => item.name.trim().toLowerCase() === wanted);
}

/**
 * Every sheet of an uploaded workbook, as cell text.
 *
 * Unlike the value-chain importer this does not go hunting for the sheet that
 * looks right: the product generated this file, so the sheets are read by the
 * names it wrote and a workbook missing any of them is refused by name.
 */
async function readWorkbookSheets(file: File): Promise<Record<string, string[][]>> {
  const workbook = new ExcelJS.Workbook();
  // exceljs reads a Node Buffer, not the ArrayBuffer a File hands over. The
  // cast bridges @types/node's generic Buffer and the plain one exceljs's
  // types were written against; the value is a real Buffer either way.
  const buffer = Buffer.from(await file.arrayBuffer()) as unknown as Parameters<
    typeof workbook.xlsx.load
  >[0];
  await workbook.xlsx.load(buffer);

  const sheets: Record<string, string[][]> = {};
  for (const worksheet of workbook.worksheets) {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cells[column - 1] = cellText(cell.value);
      });
      rows.push(Array.from(cells, (cell) => cell ?? ""));
    });
    sheets[worksheet.name] = rows;
  }
  return sheets;
}

/** A cell's text, whatever exceljs decided the cell was. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("").trim();
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
  }
  return "";
}

function buildSummary(
  plan: ImportPlan,
  existing: { roles: { name: string }[]; people: { name: string }[]; processNames: string[] }
): ImportSummary {
  const split = (names: string[], have: { name: string }[]) => {
    const existingNames: string[] = [];
    const newNames: string[] = [];
    for (const name of names) (findByName(have, name) ? existingNames : newNames).push(name);
    return { existingNames, newNames };
  };
  const roles = split(plan.roleNames, existing.roles);
  const people = split(plan.personNames, existing.people);

  return {
    processName: plan.process.name,
    nameAlreadyExists: existing.processNames.some(
      (n) => n.trim().toLowerCase() === plan.process.name.trim().toLowerCase()
    ),
    stepCount: plan.steps.length,
    connectionCount: plan.connections.length,
    raciCount: plan.raci.length,
    authorityRuleCount: plan.authority.length,
    kpiCount: plan.kpis.length,
    externalEntityCount: plan.externalEntities.length,
    existingRoles: roles.existingNames,
    newRoles: roles.newNames,
    existingPeople: people.existingNames,
    newPeople: people.newNames,
    problems: plan.problems,
  };
}

/**
 * Builds a whole process from a filled-in template.
 *
 * Runs twice for one import — once as a dry run to show what would happen,
 * then for real once the consultant has looked at it and confirmed. The file
 * is uploaded again with the confirmation and re-parsed rather than held
 * server-side between the two: parsing is deterministic, so the import that
 * runs is the one that was previewed, and declining costs nothing because
 * nothing was kept.
 *
 * The write is one transaction. A half-built process is worse than a refused
 * file — somebody has to unpick it by hand — so there is no partial success
 * even where one would be possible.
 */
export async function importProcess(
  formData: FormData
): Promise<ActionResult<{ summary: ImportSummary; created?: { processId: string; code: string } }>> {
  const parsed = importSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    dryRun: formData.get("dryRun") === "true",
  });
  if (!parsed.success) return validationError("Invalid import request", parsed.error.issues);

  const { workspaceId, dryRun } = parsed.data;

  // Checked on both calls, and on the server regardless of what the page
  // displayed — hiding the control is presentation, this is the enforcement.
  const access = await requireWorkspaceAccess(workspaceId, "EDITOR");
  if (!access.ok) return access;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return validationError("Choose a file to import.");
  if (file.size > MAX_IMPORT_BYTES) {
    return validationError("That file is too large to import (max 4 MB).");
  }

  let sheets: Record<string, string[][]>;
  try {
    sheets = await readWorkbookSheets(file);
  } catch (cause) {
    console.error("Process import: could not read the workbook", cause);
    return validationError(
      `That file couldn't be read as a spreadsheet (.xlsx). Download the template from this page and fill that in.`
    );
  }

  const plan = parseWorkbook(sheets);

  const [roles, people, processes] = await Promise.all([
    prisma.role.findMany({ where: { workspaceId, archivedAt: null }, select: { id: true, name: true } }),
    prisma.person.findMany({ where: { workspaceId, archivedAt: null }, select: { id: true, name: true } }),
    prisma.process.findMany({ where: { workspaceId, archivedAt: null }, select: { name: true, code: true } }),
  ]);

  const summary = buildSummary(plan, {
    roles,
    people,
    processNames: processes.map((p) => p.name),
  });

  if (dryRun) return ok({ summary });

  // The commit path refuses outright rather than trusting that a client which
  // reached it must have seen a clean preview.
  if (plan.problems.length > 0) {
    return validationError(
      `That file still has ${plan.problems.length} problem${plan.problems.length === 1 ? "" : "s"}. Nothing was imported.`
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    // --- roles and people: matched by name, never duplicated ---------------
    const roleIdByName = new Map<string, string>();
    for (const role of roles) roleIdByName.set(role.name.trim().toLowerCase(), role.id);
    for (const name of plan.roleNames) {
      const k = name.trim().toLowerCase();
      if (roleIdByName.has(k)) continue;
      const role = await tx.role.create({ data: { workspaceId, name } });
      roleIdByName.set(k, role.id);
    }

    const personIdByName = new Map<string, string>();
    for (const person of people) personIdByName.set(person.name.trim().toLowerCase(), person.id);
    for (const name of plan.personNames) {
      const k = name.trim().toLowerCase();
      if (personIdByName.has(k)) continue;
      const person = await tx.person.create({ data: { workspaceId, name } });
      personIdByName.set(k, person.id);
    }

    const roleIdFor = (name: string | null) =>
      name ? (roleIdByName.get(name.trim().toLowerCase()) ?? null) : null;
    const personIdFor = (name: string | null) =>
      name ? (personIdByName.get(name.trim().toLowerCase()) ?? null) : null;

    // --- the process ------------------------------------------------------
    // The code is generated here exactly as it is for a process created by
    // hand; the template never offers a column for one.
    const code = generateProcessCode({
      name: plan.process.name,
      parentCode: null,
      existingCodes: processes.map((p) => p.code),
    });
    const process = await tx.process.create({
      data: {
        workspaceId,
        code,
        name: plan.process.name,
        description: plan.process.description,
        processPurpose: plan.process.processPurpose,
        inScope: plan.process.inScope,
        outOfScope: plan.process.outOfScope,
        kpis: plan.kpis.map((k) => ({ metric: k.metric, target: k.target, frequency: k.frequency })),
        externalEntities: plan.externalEntities.map((e) => ({ name: e.name, description: e.description })),
      },
    });

    // --- steps, laid out the way the Process Map lays them out ------------
    const laneOrder = assignSwimlanes(
      plan.steps.map((s) => ({
        id: s.label,
        assignedRoleId: roleIdFor(s.assignedRole),
        swimlaneRoleId: roleIdFor(s.swimlaneRole),
      }))
    ).laneOrder;

    const stepIdByLabel = new Map<string, string>();
    for (const [index, step] of plan.steps.entries()) {
      const swimlaneRoleId = roleIdFor(step.swimlaneRole);
      const created = await tx.processStep.create({
        data: {
          processId: process.id,
          type: step.type,
          label: step.label,
          assignedRoleId: roleIdFor(step.assignedRole),
          swimlaneRoleId,
          detailedAction: step.detailedAction,
          exceptionHandling: step.exceptionHandling,
          milestone: step.milestone,
          order: index,
          positionX: FIRST_STEP_X + index * STEP_X_SPACING,
          positionY: laneY(swimlaneRoleId, laneOrder),
        },
      });
      stepIdByLabel.set(step.label.trim().toLowerCase(), created.id);
    }
    const stepIdFor = (label: string) => stepIdByLabel.get(label.trim().toLowerCase());

    // --- connections ------------------------------------------------------
    for (const connection of plan.connections) {
      const fromStepId = stepIdFor(connection.fromLabel);
      const toStepId = stepIdFor(connection.toLabel);
      if (!fromStepId || !toStepId) continue; // unreachable: checked before the write
      await tx.stepConnection.create({
        data: { processId: process.id, fromStepId, toStepId, label: connection.label },
      });
    }

    // --- RACI, through the Activity a hand-built process would also grow ---
    // setRaciCell creates an Activity for a step the moment somebody first
    // types a letter into its row. Doing the same here is what makes an
    // imported process structurally identical to one built by hand.
    const activityIdByStep = new Map<string, string>();
    let activityOrder = 0;
    const activityFor = async (stepLabel: string): Promise<string | null> => {
      const k = stepLabel.trim().toLowerCase();
      const existing = activityIdByStep.get(k);
      if (existing) return existing;
      const stepId = stepIdFor(stepLabel);
      if (!stepId) return null;
      const step = plan.steps.find((s) => s.label.trim().toLowerCase() === k)!;
      const activity = await tx.activity.create({
        data: { processId: process.id, name: step.label, relatedStepId: stepId, order: activityOrder++ },
      });
      activityIdByStep.set(k, activity.id);
      return activity.id;
    };

    for (const cell of plan.raci) {
      const activityId = await activityFor(cell.stepLabel);
      const roleId = roleIdFor(cell.roleName);
      if (!activityId || !roleId) continue;
      await tx.raciAssignment.upsert({
        where: { activityId_roleId: { activityId, roleId } },
        update: { code: cell.code },
        create: { activityId, roleId, code: cell.code },
      });
    }

    // --- authority, keyed on the step, as the matrix does for an unsplit one
    const assignmentIdByStep = new Map<string, string>();
    for (const rule of plan.authority) {
      const k = rule.stepLabel.trim().toLowerCase();
      let assignmentId = assignmentIdByStep.get(k);
      if (!assignmentId) {
        const stepId = stepIdFor(rule.stepLabel);
        if (!stepId) continue;
        const assignment = await tx.authorityAssignment.create({
          data: { processId: process.id, stepId },
        });
        assignmentId = assignment.id;
        assignmentIdByStep.set(k, assignmentId);
      }
      await tx.authorityRule.create({
        data: {
          assignmentId,
          order: rule.order,
          measure: rule.measure,
          amount: rule.amount,
          days: rule.days,
          direction: rule.direction,
          consequence: rule.consequence,
          whoRoleId: roleIdFor(rule.whoRole),
          whoPersonId: personIdFor(rule.whoPerson),
        },
      });
    }

    return { processId: process.id, code: process.code };
  });

  revalidatePath(`/workspaces/${workspaceId}/processes`);
  revalidatePath(`/workspaces/${workspaceId}/processes/${created.processId}/map`);
  revalidatePath(`/workspaces/${workspaceId}/value-chain`);

  return ok({ summary, created });
}
