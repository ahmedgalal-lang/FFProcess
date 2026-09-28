"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { checkAssignableOwner } from "@/lib/data/owner-assignment";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";
import { formatCaseReference } from "@/lib/domain/ethics";

/**
 * The ethics and whistleblower case register (spec 022). Every action here
 * needs ADMIN (a Firm Owner resolves to it): Editors and Viewers can't read
 * or write a case, or learn that one exists. Notes are append-only — there
 * is deliberately no action that edits or deletes one. Cases are kept out of
 * the report export and the activity log.
 */

const CHANNEL = z.enum(["HOTLINE", "EMAIL", "IN_PERSON", "MANAGER_REFERRAL", "OTHER"]);
const CATEGORY = z.enum([
  "FRAUD",
  "BRIBERY_CORRUPTION",
  "HARASSMENT_DISCRIMINATION",
  "HEALTH_SAFETY",
  "CONFLICT_OF_INTEREST",
  "DATA_MISUSE",
  "OTHER",
]);
const SEVERITY = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const OUTCOME = z.enum(["SUBSTANTIATED", "PARTIALLY_SUBSTANTIATED", "UNSUBSTANTIATED", "REFERRED"]);

const revalidate = (workspaceId: string) => revalidatePath(`/workspaces/${workspaceId}/governance`);

async function findOwnedCase(workspaceId: string, caseId: string) {
  const ethicsCase = await prisma.ethicsCase.findUnique({ where: { id: caseId } });
  return ethicsCase && ethicsCase.workspaceId === workspaceId ? ethicsCase : null;
}

const logCaseSchema = z.object({
  workspaceId: z.string().min(1),
  receivedOn: z.iso.date(),
  channel: CHANNEL,
  category: CATEGORY,
  severity: SEVERITY,
  description: z.string().trim().min(1).max(8000),
  anonymous: z.boolean(),
  reporterName: z.string().trim().max(200).nullable().optional(),
});

/**
 * Logs a case under the workspace's next reference. The counter lives on the
 * workspace and only ever goes up, so a reference is never reused, even after
 * a New case is deleted.
 */
export async function logEthicsCase(
  input: z.infer<typeof logCaseSchema>
): Promise<ActionResult<{ id: string; reference: string }>> {
  const parsed = logCaseSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const reporterName = parsed.data.reporterName || null;
  if (parsed.data.anonymous && reporterName) {
    return validationError("An anonymous report can't record who made it.");
  }

  const { workspaceId } = parsed.data;
  const created = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.update({
      where: { id: workspaceId },
      data: { nextEthicsCaseNumber: { increment: 1 } },
      select: { nextEthicsCaseNumber: true },
    });
    return tx.ethicsCase.create({
      data: {
        workspaceId,
        number: workspace.nextEthicsCaseNumber - 1,
        receivedOn: new Date(parsed.data.receivedOn),
        channel: parsed.data.channel,
        category: parsed.data.category,
        severity: parsed.data.severity,
        description: parsed.data.description,
        anonymous: parsed.data.anonymous,
        reporterName,
      },
    });
  });

  revalidate(workspaceId);
  return ok({ id: created.id, reference: formatCaseReference(created.number) });
}

const statusSchema = z.object({
  workspaceId: z.string().min(1),
  caseId: z.string().min(1),
  // Never back to New: once triaged, a case is permanent.
  status: z.enum(["TRIAGED", "UNDER_INVESTIGATION", "CLOSED"]),
  outcome: OUTCOME.nullable().optional(),
  closingSummary: z.string().trim().max(8000).nullable().optional(),
});

/** Closing needs an outcome and a closing summary; reopening clears them. */
export async function updateEthicsCaseStatus(input: z.infer<typeof statusSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const current = await findOwnedCase(parsed.data.workspaceId, parsed.data.caseId);
  if (!current) return notFound();

  const closing = parsed.data.status === "CLOSED";
  const outcome = parsed.data.outcome ?? null;
  const closingSummary = parsed.data.closingSummary || null;
  if (closing && (!outcome || !closingSummary)) {
    return validationError("Closing a case needs an outcome and a closing summary.");
  }

  await prisma.ethicsCase.update({
    where: { id: current.id },
    data: {
      status: parsed.data.status,
      outcome: closing ? outcome : null,
      closingSummary: closing ? closingSummary : null,
      closedAt: closing ? (current.closedAt ?? new Date()) : null,
    },
  });

  revalidate(parsed.data.workspaceId);
  return ok({ id: current.id });
}

const investigatorSchema = z.object({
  workspaceId: z.string().min(1),
  caseId: z.string().min(1),
  investigatorPersonId: z.string().min(1).nullable().optional(),
  investigatorName: z.string().trim().max(200).nullable().optional(),
});

/**
 * Assigns a person from the directory, or names someone outside it. The name
 * is always stored, so it survives the person being archived or removed.
 * Neither clears the assignment.
 */
export async function assignEthicsInvestigator(input: z.infer<typeof investigatorSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = investigatorSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const { workspaceId } = parsed.data;
  const current = await findOwnedCase(workspaceId, parsed.data.caseId);
  if (!current) return notFound();

  const personId = parsed.data.investigatorPersonId ?? null;
  let name = parsed.data.investigatorName || null;
  if (personId) {
    const problem = await checkAssignableOwner(workspaceId, null, personId, { roleId: null, personId: current.investigatorPersonId });
    if (problem) return problem;
    name = (await prisma.person.findUniqueOrThrow({ where: { id: personId } })).name;
  }

  await prisma.ethicsCase.update({
    where: { id: current.id },
    data: { investigatorPersonId: personId, investigatorName: name },
  });

  revalidate(workspaceId);
  return ok({ id: current.id });
}

const noteSchema = z.object({
  workspaceId: z.string().min(1),
  caseId: z.string().min(1),
  body: z.string().trim().min(1).max(8000),
});

/** Appends a dated note attributed to the Admin writing it. Notes can't be edited or deleted. */
export async function addEthicsCaseNote(input: z.infer<typeof noteSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  if (!(await findOwnedCase(parsed.data.workspaceId, parsed.data.caseId))) return notFound();

  const note = await prisma.ethicsCaseNote.create({
    data: { caseId: parsed.data.caseId, body: parsed.data.body, authorUserId: access.data.userId },
  });

  revalidate(parsed.data.workspaceId);
  return ok({ id: note.id });
}

const caseRefSchema = z.object({ workspaceId: z.string().min(1), caseId: z.string().min(1) });

/** Only a New case can be deleted, as a mistaken entry; once triaged it's permanent. */
export async function deleteEthicsCase(input: z.infer<typeof caseRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = caseRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const current = await findOwnedCase(parsed.data.workspaceId, parsed.data.caseId);
  if (!current) return notFound();
  if (current.status !== "NEW") return validationError("Only a New case can be deleted. Once triaged, a case is permanent.");

  await prisma.ethicsCase.delete({ where: { id: current.id } });

  revalidate(parsed.data.workspaceId);
  return ok({ id: current.id });
}
