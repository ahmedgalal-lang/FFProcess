"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { checkAssignableOwner } from "@/lib/data/owner-assignment";
import { checkLinkableProcess } from "@/lib/data/process-link";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";

/**
 * The incident log (spec 024): what actually went wrong, as distinct from the
 * Risk Register's what might. Workspace-wide rather than per aspect. Every
 * write needs EDITOR, and every id is checked against the workspace.
 */

const SEVERITY = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const CATEGORY = z.enum(["OPERATIONAL", "FINANCIAL", "IT_SECURITY", "HEALTH_SAFETY", "COMPLIANCE", "OTHER"]);
const STATUS = z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]);

const ROOT_CAUSE_REQUIRED = "Record a root cause before resolving or closing an incident.";

const revalidate = (workspaceId: string) => revalidatePath(`/workspaces/${workspaceId}/governance`);

async function findOwnedIncident(workspaceId: string, incidentId: string) {
  const incident = await prisma.governanceIncident.findUnique({ where: { id: incidentId } });
  return incident && incident.workspaceId === workspaceId ? incident : null;
}

async function findOwnedAction(workspaceId: string, actionId: string) {
  const action = await prisma.governanceIncidentAction.findUnique({
    where: { id: actionId },
    include: { incident: { select: { workspaceId: true } } },
  });
  return action && action.incident.workspaceId === workspaceId ? action : null;
}

const addIncidentSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  occurredAt: z.iso.date(),
  severity: SEVERITY,
  category: CATEGORY,
  processId: z.string().min(1).nullable().optional(),
});

export async function addIncident(input: z.infer<typeof addIncidentSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = addIncidentSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId } = parsed.data;
  const processId = parsed.data.processId ?? null;
  const processProblem = await checkLinkableProcess(workspaceId, processId);
  if (processProblem) return processProblem;

  const incident = await prisma.governanceIncident.create({
    data: {
      workspaceId,
      title: parsed.data.title,
      description: parsed.data.description,
      occurredAt: new Date(parsed.data.occurredAt),
      severity: parsed.data.severity,
      category: parsed.data.category,
      processId,
    },
  });

  revalidate(workspaceId);
  return ok({ id: incident.id });
}

const updateIncidentSchema = z.object({
  workspaceId: z.string().min(1),
  incidentId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(8000).optional(),
  occurredAt: z.iso.date().optional(),
  severity: SEVERITY.optional(),
  category: CATEGORY.optional(),
  processId: z.string().min(1).nullable().optional(),
  status: STATUS.optional(),
  rootCause: z.string().trim().max(8000).nullable().optional(),
});

/**
 * Any status can follow any other (incidents get reopened), with one rule:
 * Resolved and Closed need a root cause. Closing stamps the close date, and
 * reopening clears it.
 */
export async function updateIncident(input: z.infer<typeof updateIncidentSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = updateIncidentSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, incidentId } = parsed.data;
  const current = await findOwnedIncident(workspaceId, incidentId);
  if (!current) return notFound();

  if (parsed.data.processId !== undefined) {
    const processProblem = await checkLinkableProcess(workspaceId, parsed.data.processId, current.processId);
    if (processProblem) return processProblem;
  }

  const status = parsed.data.status ?? current.status;
  const rootCause = parsed.data.rootCause !== undefined ? parsed.data.rootCause || null : current.rootCause;
  if ((status === "RESOLVED" || status === "CLOSED") && !rootCause?.trim()) return validationError(ROOT_CAUSE_REQUIRED);

  await prisma.governanceIncident.update({
    where: { id: incidentId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
      severity: parsed.data.severity,
      category: parsed.data.category,
      processId: parsed.data.processId,
      status,
      rootCause,
      closedAt: status === "CLOSED" ? (current.closedAt ?? new Date()) : null,
    },
  });

  revalidate(workspaceId);
  return ok({ id: incidentId });
}

const incidentRefSchema = z.object({
  workspaceId: z.string().min(1),
  incidentId: z.string().min(1),
});

/** Deletes the incident, its corrective actions, and its risk links — never the risks. */
export async function deleteIncident(input: z.infer<typeof incidentRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = incidentRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedIncident(parsed.data.workspaceId, parsed.data.incidentId))) return notFound();

  await prisma.governanceIncident.delete({ where: { id: parsed.data.incidentId } });

  revalidate(parsed.data.workspaceId);
  return ok({ id: parsed.data.incidentId });
}

const setBreachSchema = z.object({
  workspaceId: z.string().min(1),
  incidentId: z.string().min(1),
  personalDataBreach: z.boolean(),
  breachAwareAt: z.iso.datetime({ offset: true }).nullable().optional(),
  regulatorNotifiedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  notificationNotRequiredReason: z.string().trim().max(4000).nullable().optional(),
});

/**
 * Flags (or unflags) an incident as a personal data breach, with when the
 * client became aware of it and the notification decision: the regulator
 * was notified, or notification wasn't required and why — not both.
 * Unflagging clears all of it.
 */
export async function setIncidentBreach(input: z.infer<typeof setBreachSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = setBreachSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedIncident(parsed.data.workspaceId, parsed.data.incidentId))) return notFound();

  const flagged = parsed.data.personalDataBreach;
  const notifiedAt = flagged && parsed.data.regulatorNotifiedAt ? new Date(parsed.data.regulatorNotifiedAt) : null;
  const reason = flagged ? parsed.data.notificationNotRequiredReason || null : null;
  if (notifiedAt && reason) {
    return validationError("Record either that the regulator was notified or why it wasn't required, not both.");
  }

  await prisma.governanceIncident.update({
    where: { id: parsed.data.incidentId },
    data: {
      personalDataBreach: flagged,
      breachAwareAt: flagged && parsed.data.breachAwareAt ? new Date(parsed.data.breachAwareAt) : null,
      regulatorNotifiedAt: notifiedAt,
      notificationNotRequiredReason: reason,
    },
  });

  revalidate(parsed.data.workspaceId);
  return ok({ id: parsed.data.incidentId });
}

const addActionSchema = z.object({
  workspaceId: z.string().min(1),
  incidentId: z.string().min(1),
  description: z.string().trim().min(1).max(2000),
  ownerRoleId: z.string().min(1).nullable().optional(),
  ownerPersonId: z.string().min(1).nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
});

export async function addIncidentAction(input: z.infer<typeof addActionSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = addActionSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, incidentId } = parsed.data;
  if (!(await findOwnedIncident(workspaceId, incidentId))) return notFound();

  const ownerRoleId = parsed.data.ownerRoleId ?? null;
  const ownerPersonId = parsed.data.ownerPersonId ?? null;
  const ownerProblem = await checkAssignableOwner(workspaceId, ownerRoleId, ownerPersonId);
  if (ownerProblem) return ownerProblem;

  const action = await prisma.governanceIncidentAction.create({
    data: {
      incidentId,
      description: parsed.data.description,
      ownerRoleId,
      ownerPersonId,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  revalidate(workspaceId);
  return ok({ id: action.id });
}

const setDoneSchema = z.object({
  workspaceId: z.string().min(1),
  actionId: z.string().min(1),
  done: z.boolean(),
});

export async function setIncidentActionDone(input: z.infer<typeof setDoneSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = setDoneSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedAction(parsed.data.workspaceId, parsed.data.actionId))) return notFound();

  await prisma.governanceIncidentAction.update({
    where: { id: parsed.data.actionId },
    data: { doneAt: parsed.data.done ? new Date() : null },
  });

  revalidate(parsed.data.workspaceId);
  return ok({ id: parsed.data.actionId });
}

const actionRefSchema = z.object({
  workspaceId: z.string().min(1),
  actionId: z.string().min(1),
});

export async function deleteIncidentAction(input: z.infer<typeof actionRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = actionRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedAction(parsed.data.workspaceId, parsed.data.actionId))) return notFound();

  await prisma.governanceIncidentAction.delete({ where: { id: parsed.data.actionId } });

  revalidate(parsed.data.workspaceId);
  return ok({ id: parsed.data.actionId });
}

const riskLinkSchema = z.object({
  workspaceId: z.string().min(1),
  incidentId: z.string().min(1),
  riskId: z.string().min(1),
});

/** Traces a risk on the Risk Register to an incident where it materialised. Idempotent. */
export async function linkIncidentRisk(input: z.infer<typeof riskLinkSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = riskLinkSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, incidentId, riskId } = parsed.data;
  if (!(await findOwnedIncident(workspaceId, incidentId))) return notFound();
  const risk = await prisma.governanceRisk.findUnique({ where: { id: riskId } });
  if (!risk || risk.workspaceId !== workspaceId) return notFound();

  await prisma.governanceIncidentRisk.upsert({
    where: { incidentId_riskId: { incidentId, riskId } },
    create: { incidentId, riskId },
    update: {},
  });

  revalidate(workspaceId);
  return ok({ id: incidentId });
}

export async function unlinkIncidentRisk(input: z.infer<typeof riskLinkSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = riskLinkSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, incidentId, riskId } = parsed.data;
  if (!(await findOwnedIncident(workspaceId, incidentId))) return notFound();

  await prisma.governanceIncidentRisk.deleteMany({ where: { incidentId, riskId } });

  revalidate(workspaceId);
  return ok({ id: incidentId });
}
