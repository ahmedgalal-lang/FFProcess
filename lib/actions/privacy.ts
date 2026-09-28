"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { checkAssignableOwner } from "@/lib/data/owner-assignment";
import { checkLinkableProcess } from "@/lib/data/process-link";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";

/**
 * The data privacy register (spec 025): a record of processing activities
 * (GDPR Art. 30), their DPIAs (Art. 35), and links from personal-data
 * breaches — read from the incident log (spec 024), never duplicated — to
 * the activities they affected. EDITOR writes, except approving a DPIA,
 * which is a sign-off and takes ADMIN, like approving a policy.
 */

const LAWFUL_BASIS = z.enum(["CONSENT", "CONTRACT", "LEGAL_OBLIGATION", "VITAL_INTERESTS", "PUBLIC_TASK", "LEGITIMATE_INTERESTS"]);
const RESIDUAL = z.enum(["LOW", "MEDIUM", "HIGH"]);
const LIST = z.array(z.string().trim().min(1).max(200)).max(50);

const revalidate = (workspaceId: string) => revalidatePath(`/workspaces/${workspaceId}/governance`);

async function findOwnedActivity(workspaceId: string, activityId: string) {
  const activity = await prisma.processingActivity.findUnique({ where: { id: activityId } });
  return activity && activity.workspaceId === workspaceId ? activity : null;
}

async function findOwnedDpia(workspaceId: string, dpiaId: string) {
  const dpia = await prisma.dpia.findUnique({ where: { id: dpiaId }, include: { activity: { select: { workspaceId: true } } } });
  return dpia && dpia.activity.workspaceId === workspaceId ? dpia : null;
}

const activityFields = {
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(4000),
  lawfulBasis: LAWFUL_BASIS,
  dataSubjectCategories: LIST,
  personalDataCategories: LIST,
  recipients: LIST,
  retentionPeriod: z.string().trim().min(1).max(200),
  specialCategory: z.boolean(),
  transferDestination: z.string().trim().max(200).nullable(),
  transferSafeguard: z.string().trim().max(400).nullable(),
  processId: z.string().min(1).nullable(),
  ownerRoleId: z.string().min(1).nullable(),
  ownerPersonId: z.string().min(1).nullable(),
};

const addActivitySchema = z
  .object(activityFields)
  .partial({
    specialCategory: true,
    transferDestination: true,
    transferSafeguard: true,
    processId: true,
    ownerRoleId: true,
    ownerPersonId: true,
  })
  .extend({ workspaceId: z.string().min(1) });

export async function addProcessingActivity(input: z.infer<typeof addActivitySchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = addActivitySchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId } = parsed.data;
  const processId = parsed.data.processId ?? null;
  const ownerRoleId = parsed.data.ownerRoleId ?? null;
  const ownerPersonId = parsed.data.ownerPersonId ?? null;
  const problem =
    (await checkLinkableProcess(workspaceId, processId)) ?? (await checkAssignableOwner(workspaceId, ownerRoleId, ownerPersonId));
  if (problem) return problem;

  const activity = await prisma.processingActivity.create({
    data: {
      workspaceId,
      name: parsed.data.name,
      purpose: parsed.data.purpose,
      lawfulBasis: parsed.data.lawfulBasis,
      dataSubjectCategories: parsed.data.dataSubjectCategories,
      personalDataCategories: parsed.data.personalDataCategories,
      recipients: parsed.data.recipients,
      retentionPeriod: parsed.data.retentionPeriod,
      specialCategory: parsed.data.specialCategory ?? false,
      transferDestination: parsed.data.transferDestination || null,
      transferSafeguard: parsed.data.transferSafeguard || null,
      processId,
      ownerRoleId,
      ownerPersonId,
    },
  });

  revalidate(workspaceId);
  return ok({ id: activity.id });
}

const updateActivitySchema = z
  .object(activityFields)
  .partial()
  .extend({ workspaceId: z.string().min(1), activityId: z.string().min(1) });

/** Only the fields given change. The owner is replaced as a pair when either side is given. */
export async function updateProcessingActivity(input: z.infer<typeof updateActivitySchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = updateActivitySchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, activityId, ...fields } = parsed.data;
  const current = await findOwnedActivity(workspaceId, activityId);
  if (!current) return notFound();

  if (fields.processId !== undefined) {
    const problem = await checkLinkableProcess(workspaceId, fields.processId, current.processId);
    if (problem) return problem;
  }
  const ownerChanging = fields.ownerRoleId !== undefined || fields.ownerPersonId !== undefined;
  if (ownerChanging) {
    const problem = await checkAssignableOwner(workspaceId, fields.ownerRoleId ?? null, fields.ownerPersonId ?? null, {
      roleId: current.ownerRoleId,
      personId: current.ownerPersonId,
    });
    if (problem) return problem;
  }

  await prisma.processingActivity.update({
    where: { id: activityId },
    data: {
      ...fields,
      transferDestination: fields.transferDestination === undefined ? undefined : fields.transferDestination || null,
      transferSafeguard: fields.transferSafeguard === undefined ? undefined : fields.transferSafeguard || null,
      ownerRoleId: ownerChanging ? (fields.ownerRoleId ?? null) : undefined,
      ownerPersonId: ownerChanging ? (fields.ownerPersonId ?? null) : undefined,
    },
  });

  revalidate(workspaceId);
  return ok({ id: activityId });
}

const activityRefSchema = z.object({ workspaceId: z.string().min(1), activityId: z.string().min(1) });

/** Deletes the activity with its DPIAs and breach links — never the breach incidents. */
export async function deleteProcessingActivity(input: z.infer<typeof activityRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = activityRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedActivity(parsed.data.workspaceId, parsed.data.activityId))) return notFound();

  await prisma.processingActivity.delete({ where: { id: parsed.data.activityId } });

  revalidate(parsed.data.workspaceId);
  return ok({ id: parsed.data.activityId });
}

const addDpiaSchema = z.object({
  workspaceId: z.string().min(1),
  activityId: z.string().min(1),
  risksIdentified: z.string().trim().min(1).max(8000),
  mitigations: z.string().trim().min(1).max(8000),
  residualRisk: RESIDUAL,
});

export async function addDpia(input: z.infer<typeof addDpiaSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = addDpiaSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedActivity(parsed.data.workspaceId, parsed.data.activityId))) return notFound();

  const dpia = await prisma.dpia.create({
    data: {
      activityId: parsed.data.activityId,
      risksIdentified: parsed.data.risksIdentified,
      mitigations: parsed.data.mitigations,
      residualRisk: parsed.data.residualRisk,
    },
  });

  revalidate(parsed.data.workspaceId);
  return ok({ id: dpia.id });
}

const updateDpiaSchema = z.object({
  workspaceId: z.string().min(1),
  dpiaId: z.string().min(1),
  risksIdentified: z.string().trim().min(1).max(8000).optional(),
  mitigations: z.string().trim().min(1).max(8000).optional(),
  residualRisk: RESIDUAL.optional(),
});

/**
 * Editing an approved DPIA's content returns it to Draft and clears the
 * approval: the sign-off was for what it said then (the same rule spec 018
 * applies to policies). A save that changes nothing leaves it approved.
 */
export async function updateDpia(input: z.infer<typeof updateDpiaSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = updateDpiaSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const current = await findOwnedDpia(parsed.data.workspaceId, parsed.data.dpiaId);
  if (!current) return notFound();

  const { risksIdentified, mitigations, residualRisk } = parsed.data;
  const changed =
    (risksIdentified !== undefined && risksIdentified !== current.risksIdentified) ||
    (mitigations !== undefined && mitigations !== current.mitigations) ||
    (residualRisk !== undefined && residualRisk !== current.residualRisk);

  await prisma.dpia.update({
    where: { id: current.id },
    data: {
      risksIdentified,
      mitigations,
      residualRisk,
      ...(changed && current.status === "APPROVED" ? { status: "DRAFT", approvedAt: null, approvedByUserId: null } : {}),
    },
  });

  revalidate(parsed.data.workspaceId);
  return ok({ id: current.id });
}

const dpiaRefSchema = z.object({ workspaceId: z.string().min(1), dpiaId: z.string().min(1) });

/** A sign-off: ADMIN only, recording who approved it and when. */
export async function approveDpia(input: z.infer<typeof dpiaRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = dpiaRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "ADMIN");
  if (!access.ok) return access;

  const current = await findOwnedDpia(parsed.data.workspaceId, parsed.data.dpiaId);
  if (!current) return notFound();
  if (current.status === "APPROVED") return validationError("This DPIA is already approved.");

  await prisma.dpia.update({
    where: { id: current.id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: access.data.userId },
  });

  revalidate(parsed.data.workspaceId);
  return ok({ id: current.id });
}

export async function deleteDpia(input: z.infer<typeof dpiaRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = dpiaRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedDpia(parsed.data.workspaceId, parsed.data.dpiaId))) return notFound();

  await prisma.dpia.delete({ where: { id: parsed.data.dpiaId } });

  revalidate(parsed.data.workspaceId);
  return ok({ id: parsed.data.dpiaId });
}

const breachLinkSchema = z.object({
  workspaceId: z.string().min(1),
  activityId: z.string().min(1),
  incidentId: z.string().min(1),
});

/** Links a personal-data-breach incident to an activity it affected. Idempotent. */
export async function linkBreachToActivity(input: z.infer<typeof breachLinkSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = breachLinkSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, activityId, incidentId } = parsed.data;
  if (!(await findOwnedActivity(workspaceId, activityId))) return notFound();
  const incident = await prisma.governanceIncident.findUnique({ where: { id: incidentId } });
  if (!incident || incident.workspaceId !== workspaceId) return notFound();
  if (!incident.personalDataBreach) return validationError("Only an incident flagged as a personal data breach can be linked.");

  await prisma.processingBreachLink.upsert({
    where: { activityId_incidentId: { activityId, incidentId } },
    create: { activityId, incidentId },
    update: {},
  });

  revalidate(workspaceId);
  return ok({ id: activityId });
}

export async function unlinkBreachFromActivity(input: z.infer<typeof breachLinkSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = breachLinkSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, activityId, incidentId } = parsed.data;
  if (!(await findOwnedActivity(workspaceId, activityId))) return notFound();

  await prisma.processingBreachLink.deleteMany({ where: { activityId, incidentId } });

  revalidate(workspaceId);
  return ok({ id: activityId });
}
