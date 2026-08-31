"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import ExcelJS from "exceljs";
import { phaseColorFor } from "@/lib/domain/value-chain";
import { buildImportPlan, matchHeaders, type ImportPlan } from "@/lib/domain/value-chain-import";
import { FIRST_STEP_X, laneY, nextStepX, STEP_X_SPACING } from "@/lib/domain/process-layout";
import { generateProcessCode } from "@/lib/domain/process-hierarchy";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";

function revalidateBoard(workspaceId: string) {
  revalidatePath(`/workspaces/${workspaceId}/value-chain`);
}

const createPhaseSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
});

/** Adds a stage to the end of the value chain, in the next palette colour. */
export async function createPhase(
  input: z.infer<typeof createPhaseSchema>
): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = createPhaseSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid phase name", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const existing = await prisma.phase.findMany({
    where: { workspaceId: parsed.data.workspaceId },
    select: { id: true, name: true },
  });
  if (existing.some((p) => p.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return validationError(`There's already a phase called "${parsed.data.name}".`);
  }

  const phase = await prisma.phase.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      order: existing.length,
      color: phaseColorFor(existing.length),
    },
  });

  revalidateBoard(parsed.data.workspaceId);
  return ok({ id: phase.id, name: phase.name });
}

const renamePhaseSchema = z.object({
  workspaceId: z.string().min(1),
  phaseId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
});

export async function renamePhase(
  input: z.infer<typeof renamePhaseSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = renamePhaseSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid phase name", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const phase = await prisma.phase.findUnique({ where: { id: parsed.data.phaseId } });
  if (!phase || phase.workspaceId !== parsed.data.workspaceId) return notFound();

  const clash = await prisma.phase.findFirst({
    where: {
      workspaceId: parsed.data.workspaceId,
      name: { equals: parsed.data.name, mode: "insensitive" },
      id: { not: parsed.data.phaseId },
    },
  });
  if (clash) return validationError(`There's already a phase called "${parsed.data.name}".`);

  await prisma.phase.update({ where: { id: parsed.data.phaseId }, data: { name: parsed.data.name } });
  revalidateBoard(parsed.data.workspaceId);
  return ok({ id: parsed.data.phaseId });
}

const movePhaseSchema = z.object({
  workspaceId: z.string().min(1),
  phaseId: z.string().min(1),
  direction: z.enum(["LEFT", "RIGHT"]),
});

/** Moves a stage one place along the chain, renumbering every phase from zero. */
export async function movePhase(
  input: z.infer<typeof movePhaseSchema>
): Promise<ActionResult<{ orderedPhaseIds: string[] }>> {
  const parsed = movePhaseSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const phases = await prisma.phase.findMany({
    where: { workspaceId: parsed.data.workspaceId },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true },
  });

  const ids = phases.map((p) => p.id);
  const from = ids.indexOf(parsed.data.phaseId);
  if (from === -1) return notFound();

  const to = parsed.data.direction === "LEFT" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return ok({ orderedPhaseIds: ids });

  [ids[from], ids[to]] = [ids[to]!, ids[from]!];

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.phase.update({ where: { id }, data: { order: index, color: phaseColorFor(index) } })
    )
  );

  revalidateBoard(parsed.data.workspaceId);
  return ok({ orderedPhaseIds: ids });
}

const deletePhaseSchema = z.object({
  workspaceId: z.string().min(1),
  phaseId: z.string().min(1),
});

/**
 * Removes a stage. The steps in it are not deleted — the schema's SET NULL
 * drops them back to Unphased, because the work is real even when the stage
 * someone invented for it turns out not to be.
 */
export async function deletePhase(
  input: z.infer<typeof deletePhaseSchema>
): Promise<ActionResult<{ id: string; unphasedSteps: number }>> {
  const parsed = deletePhaseSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const phase = await prisma.phase.findUnique({ where: { id: parsed.data.phaseId } });
  if (!phase || phase.workspaceId !== parsed.data.workspaceId) return notFound();

  const unphasedSteps = await prisma.processStep.count({ where: { phaseId: parsed.data.phaseId } });
  await prisma.phase.delete({ where: { id: parsed.data.phaseId } });

  const remaining = await prisma.phase.findMany({
    where: { workspaceId: parsed.data.workspaceId },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  await prisma.$transaction(
    remaining.map((p, index) =>
      prisma.phase.update({ where: { id: p.id }, data: { order: index, color: phaseColorFor(index) } })
    )
  );

  revalidateBoard(parsed.data.workspaceId);
  return ok({ id: parsed.data.phaseId, unphasedSteps });
}

const setStepPhaseSchema = z.object({
  workspaceId: z.string().min(1),
  stepId: z.string().min(1),
  /** Empty string moves the step back to Unphased. */
  phaseId: z.string().optional(),
});

/** Moves one activity card into a phase — what dropping it in a column means. */
export async function setStepPhase(
  input: z.infer<typeof setStepPhaseSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = setStepPhaseSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  // The step has to belong to this workspace, not merely exist.
  const step = await prisma.processStep.findUnique({
    where: { id: parsed.data.stepId },
    select: { id: true, processId: true, process: { select: { workspaceId: true } } },
  });
  if (!step || step.process.workspaceId !== parsed.data.workspaceId) return notFound();

  if (parsed.data.phaseId) {
    const phase = await prisma.phase.findUnique({ where: { id: parsed.data.phaseId } });
    if (!phase || phase.workspaceId !== parsed.data.workspaceId) return notFound();
  }

  await prisma.processStep.update({
    where: { id: parsed.data.stepId },
    data: { phaseId: parsed.data.phaseId || null },
  });

  revalidateBoard(parsed.data.workspaceId);
  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${step.processId}/map`);
  return ok({ id: parsed.data.stepId });
}

const setSupportingRolesSchema = z.object({
  workspaceId: z.string().min(1),
  stepId: z.string().min(1),
  roleIds: z.array(z.string().min(1)),
});

/** Sets the departments supporting a step — the card's "Support:" line. */
export async function setStepSupportingRoles(
  input: z.infer<typeof setSupportingRolesSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = setSupportingRolesSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const step = await prisma.processStep.findUnique({
    where: { id: parsed.data.stepId },
    select: { id: true, processId: true, process: { select: { workspaceId: true } } },
  });
  if (!step || step.process.workspaceId !== parsed.data.workspaceId) return notFound();

  const roles = await prisma.role.findMany({
    where: { id: { in: parsed.data.roleIds }, workspaceId: parsed.data.workspaceId },
    select: { id: true },
  });
  if (roles.length !== parsed.data.roleIds.length) return notFound();

  await prisma.processStep.update({
    where: { id: parsed.data.stepId },
    data: { supportingRoles: { set: roles.map((r) => ({ id: r.id })) } },
  });

  revalidateBoard(parsed.data.workspaceId);
  return ok({ id: parsed.data.stepId });
}

const createActivitySchema = z.object({
  workspaceId: z.string().min(1),
  processId: z.string().min(1),
  phaseId: z.string().optional(),
  label: z.string().trim().min(1).max(200),
  ownerRoleId: z.string().optional(),
  description: z.string().trim().max(2000).optional(),
});

/**
 * Adds an activity straight from the board. It's a real step on a real process
 * — the board is a view over the same data as the Process Map, not a second
 * place to keep work — so it lands at the end of that process's steps.
 */
export async function createActivity(
  input: z.infer<typeof createActivitySchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createActivitySchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid activity", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const process = await prisma.process.findUnique({ where: { id: parsed.data.processId } });
  if (!process || process.workspaceId !== parsed.data.workspaceId) return notFound();

  if (parsed.data.phaseId) {
    const phase = await prisma.phase.findUnique({ where: { id: parsed.data.phaseId } });
    if (!phase || phase.workspaceId !== parsed.data.workspaceId) return notFound();
  }
  if (parsed.data.ownerRoleId) {
    const role = await prisma.role.findUnique({ where: { id: parsed.data.ownerRoleId } });
    if (!role || role.workspaceId !== parsed.data.workspaceId) return notFound();
  }

  const steps = await prisma.processStep.findMany({
    where: { processId: parsed.data.processId },
    select: { positionX: true, swimlaneRoleId: true, assignedRoleId: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const laneOrder: string[] = [];
  for (const s of steps) {
    const roleId = s.swimlaneRoleId ?? s.assignedRoleId;
    if (roleId && !laneOrder.includes(roleId)) laneOrder.push(roleId);
  }

  const created = await prisma.processStep.create({
    data: {
      processId: parsed.data.processId,
      type: "TASK",
      label: parsed.data.label,
      assignedRoleId: parsed.data.ownerRoleId || undefined,
      swimlaneRoleId: parsed.data.ownerRoleId || undefined,
      phaseId: parsed.data.phaseId || undefined,
      detailedAction: parsed.data.description ? [parsed.data.description] : [],
      positionX: nextStepX(steps.map((s) => s.positionX)),
      positionY: laneY(parsed.data.ownerRoleId ?? null, laneOrder),
      order: steps.length,
    },
  });

  revalidateBoard(parsed.data.workspaceId);
  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes/${parsed.data.processId}/map`);
  return ok({ id: created.id });
}

/** Roughly 4 MB — a value-chain workbook is a table, not a data warehouse. */
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export type ImportPreview = {
  sheetName: string;
  plan: ImportPlan;
  /** Phases and departments that already exist here and will be reused as-is. */
  existingPhases: string[];
  existingDepartments: string[];
};

/**
 * One cell as plain text. exceljs's own `cell.text` throws on an empty cell,
 * and a cell can hold a formula, rich text, a hyperlink or a date as easily as
 * a string — so every shape is flattened here rather than trusted to be one.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((run) => run.text ?? "").join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
  }

  return "";
}

/**
 * Reads every sheet and picks the first that actually looks like a value chain
 * — a header row naming a phase and an activity. Scanning rather than trusting
 * a sheet name, because the tab holding the table is called something different
 * in every workbook, and the other tabs are usually free-form workshop notes.
 */
async function readValueChainSheet(
  file: File
): Promise<{ sheetName: string; rows: string[][] } | null> {
  const workbook = new ExcelJS.Workbook();
  // exceljs reads a Node Buffer, not the ArrayBuffer a File hands over. The
  // cast bridges @types/node's generic Buffer and the plain one exceljs's
  // types were written against; the value is a real Buffer either way.
  const buffer = Buffer.from(await file.arrayBuffer()) as unknown as Parameters<
    typeof workbook.xlsx.load
  >[0];
  await workbook.xlsx.load(buffer);

  for (const worksheet of workbook.worksheets) {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cells[column - 1] = cellText(cell.value);
      });
      rows.push(Array.from(cells, (cell) => cell ?? ""));
    });

    if (rows.some((row) => matchHeaders(row) !== null)) {
      return { sheetName: worksheet.name, rows };
    }
  }

  return null;
}

/** Case-insensitive lookup, so "Technical Office" and "Technical office" are one department. */
function findByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const wanted = name.trim().toLowerCase();
  return items.find((item) => item.name.trim().toLowerCase() === wanted);
}

const importSchema = z.object({
  workspaceId: z.string().min(1),
  /** Name for the process the activities land on; ignored when processId is set. */
  processName: z.string().trim().max(120).optional(),
  processId: z.string().min(1).optional(),
  dryRun: z.boolean(),
});

/**
 * Imports a value chain from a spreadsheet: its phases in the order they first
 * appear, its departments as Roles, and its activities as steps on one process,
 * chained in phase order.
 *
 * Runs twice for one import — once as a dry run to show what would happen, then
 * for real once someone has looked at it. Nothing here overwrites: a phase or
 * department that already exists by name is reused, never renamed or
 * duplicated.
 */
export async function importValueChain(
  formData: FormData
): Promise<ActionResult<{ preview: ImportPreview; created?: { processId: string; activities: number } }>> {
  const parsed = importSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    processName: formData.get("processName") || undefined,
    processId: formData.get("processId") || undefined,
    dryRun: formData.get("dryRun") === "true",
  });
  if (!parsed.success) return validationError("Invalid import request", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return validationError("Choose a spreadsheet to import.");
  if (file.size > MAX_IMPORT_BYTES) return validationError("That file is too large to import (max 4 MB).");

  let sheet: { sheetName: string; rows: string[][] } | null;
  try {
    sheet = await readValueChainSheet(file);
  } catch (cause) {
    console.error("Value chain import: could not read the workbook", cause);
    return validationError("That file couldn't be read as a spreadsheet (.xlsx).");
  }
  if (!sheet) {
    return validationError(
      "No sheet in that file has a value-chain table — one needs a header row with a Phase column and a Step / Activity column."
    );
  }

  const plan = buildImportPlan(sheet.rows);
  const [phases, roles] = await Promise.all([
    prisma.phase.findMany({ where: { workspaceId: parsed.data.workspaceId }, orderBy: { order: "asc" } }),
    prisma.role.findMany({ where: { workspaceId: parsed.data.workspaceId, archivedAt: null } }),
  ]);

  const preview: ImportPreview = {
    sheetName: sheet.sheetName,
    plan,
    existingPhases: plan.phases.filter((name) => findByName(phases, name)).map((name) => name),
    existingDepartments: plan.departments.filter((name) => findByName(roles, name)),
  };

  if (parsed.data.dryRun) return ok({ preview });
  if (plan.activities.length === 0) return validationError("There are no activities in that sheet to import.");

  // Phase order decides the sequence, with the sheet's own order settling ties
  // — which quietly fixes the common case of activities appended at the bottom
  // of the sheet long after the phase they belong to.
  const phaseRank = new Map(plan.phases.map((name, index) => [name, index]));
  const ordered = [...plan.activities].sort(
    (a, b) => (phaseRank.get(a.phase) ?? 0) - (phaseRank.get(b.phase) ?? 0) || a.sourceRow - b.sourceRow
  );

  const created = await prisma.$transaction(async (tx) => {
    const phaseIdByName = new Map<string, string>();
    let nextPhaseOrder = phases.length;
    for (const name of plan.phases) {
      const existing = findByName(phases, name);
      if (existing) {
        phaseIdByName.set(name, existing.id);
        continue;
      }
      const phase = await tx.phase.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          name,
          order: nextPhaseOrder,
          color: phaseColorFor(nextPhaseOrder),
        },
      });
      nextPhaseOrder += 1;
      phaseIdByName.set(name, phase.id);
    }

    const roleIdByName = new Map<string, string>();
    for (const name of plan.departments) {
      const existing = findByName(roles, name);
      if (existing) {
        roleIdByName.set(name.toLowerCase(), existing.id);
        continue;
      }
      // A name may repeat with different casing across cells; the first one
      // creates the Role and the rest find it here.
      if (roleIdByName.has(name.toLowerCase())) continue;
      const role = await tx.role.create({ data: { workspaceId: parsed.data.workspaceId, name } });
      roleIdByName.set(name.toLowerCase(), role.id);
    }
    const roleIdFor = (name: string | null) => (name ? roleIdByName.get(name.trim().toLowerCase()) : undefined);

    let processId = parsed.data.processId;
    if (processId) {
      const process = await tx.process.findUnique({ where: { id: processId } });
      if (!process || process.workspaceId !== parsed.data.workspaceId) throw new Error("PROCESS_NOT_FOUND");
    } else {
      const codes = await tx.process.findMany({
        where: { workspaceId: parsed.data.workspaceId },
        select: { code: true },
      });
      const name = parsed.data.processName || sheet.sheetName;
      const code = generateProcessCode({ name, parentCode: null, existingCodes: codes.map((c) => c.code) });
      const process = await tx.process.create({
        data: { workspaceId: parsed.data.workspaceId, code, name },
      });
      processId = process.id;
    }

    const startOrder = await tx.processStep.count({ where: { processId } });
    const laneOrder: string[] = [];
    for (const activity of ordered) {
      const roleId = roleIdFor(activity.owner);
      if (roleId && !laneOrder.includes(roleId)) laneOrder.push(roleId);
    }

    let previousStepId: string | null = null;
    let positionX = FIRST_STEP_X;
    for (const [index, activity] of ordered.entries()) {
      const ownerRoleId = roleIdFor(activity.owner);
      const step = await tx.processStep.create({
        data: {
          processId,
          type: index === 0 ? "START" : index === ordered.length - 1 ? "END" : "TASK",
          label: activity.label,
          assignedRoleId: ownerRoleId,
          swimlaneRoleId: ownerRoleId,
          phaseId: phaseIdByName.get(activity.phase),
          detailedAction: activity.description ? [activity.description] : [],
          positionX,
          positionY: laneY(ownerRoleId ?? null, laneOrder),
          order: startOrder + index,
          supportingRoles: {
            connect: activity.support.flatMap((name) => {
              const id = roleIdFor(name);
              return id ? [{ id }] : [];
            }),
          },
        },
      });

      // Chained in phase order, so the imported map reads as the value chain
      // rather than as a pile of unconnected steps.
      if (previousStepId) {
        await tx.stepConnection.create({
          data: { processId, fromStepId: previousStepId, toStepId: step.id },
        });
      }
      previousStepId = step.id;
      positionX += STEP_X_SPACING;
    }

    return { processId, activities: ordered.length };
  });

  revalidateBoard(parsed.data.workspaceId);
  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes`);
  return ok({ preview, created });
}
