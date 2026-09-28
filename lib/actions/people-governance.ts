"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { checkAssignableOwner } from "@/lib/data/owner-assignment";
import { ok, notFound, validationError, type ActionResult } from "@/lib/actions/errors";

/**
 * Conflicts of interest and training records (spec 021), both held against
 * the workspace's People directory. People are archived, not deleted: an
 * archived person keeps their records (labelled as archived) but can't be
 * given new ones. EDITOR writes throughout.
 */

const CONFLICT_STATUS = z.enum(["DECLARED", "UNDER_REVIEW", "MITIGATED", "CLOSED"]);
const VALIDITY = z.number().int().min(1).max(240).nullable();

const revalidate = (workspaceId: string) => revalidatePath(`/workspaces/${workspaceId}/governance`);

/** A person these records may name: this workspace's, and not archived unless already named. */
const checkPerson = (workspaceId: string, personId: string, currentPersonId: string | null = null) =>
  checkAssignableOwner(workspaceId, null, personId, { roleId: null, personId: currentPersonId });

async function findOwnedConflict(workspaceId: string, conflictId: string) {
  const conflict = await prisma.conflictOfInterest.findUnique({ where: { id: conflictId } });
  return conflict && conflict.workspaceId === workspaceId ? conflict : null;
}

async function findOwnedCourse(workspaceId: string, courseId: string) {
  const course = await prisma.trainingCourse.findUnique({ where: { id: courseId } });
  return course && course.workspaceId === workspaceId ? course : null;
}

/** A course name already used in this workspace, ignoring case, other than `exceptId`. */
async function courseNameTaken(workspaceId: string, name: string, exceptId?: string) {
  const clash = await prisma.trainingCourse.findFirst({
    where: { workspaceId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  return clash !== null;
}

const addConflictSchema = z.object({
  workspaceId: z.string().min(1),
  personId: z.string().min(1),
  description: z.string().trim().min(1).max(4000),
  relatedParty: z.string().trim().min(1).max(200),
  declaredOn: z.iso.date(),
});

export async function addConflict(input: z.infer<typeof addConflictSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = addConflictSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, personId } = parsed.data;
  const problem = await checkPerson(workspaceId, personId);
  if (problem) return problem;

  const conflict = await prisma.conflictOfInterest.create({
    data: {
      workspaceId,
      personId,
      description: parsed.data.description,
      relatedParty: parsed.data.relatedParty,
      declaredOn: new Date(parsed.data.declaredOn),
    },
  });

  revalidate(workspaceId);
  return ok({ id: conflict.id });
}

const updateConflictSchema = z.object({
  workspaceId: z.string().min(1),
  conflictId: z.string().min(1),
  personId: z.string().min(1).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  relatedParty: z.string().trim().min(1).max(200).optional(),
  declaredOn: z.iso.date().optional(),
  status: CONFLICT_STATUS.optional(),
  mitigationNote: z.string().trim().max(4000).nullable().optional(),
});

export async function updateConflict(input: z.infer<typeof updateConflictSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = updateConflictSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, conflictId, personId, declaredOn, mitigationNote, ...rest } = parsed.data;
  const current = await findOwnedConflict(workspaceId, conflictId);
  if (!current) return notFound();

  if (personId !== undefined) {
    const problem = await checkPerson(workspaceId, personId, current.personId);
    if (problem) return problem;
  }

  await prisma.conflictOfInterest.update({
    where: { id: conflictId },
    data: {
      ...rest,
      personId,
      declaredOn: declaredOn ? new Date(declaredOn) : undefined,
      mitigationNote: mitigationNote === undefined ? undefined : mitigationNote || null,
    },
  });

  revalidate(workspaceId);
  return ok({ id: conflictId });
}

const conflictRefSchema = z.object({ workspaceId: z.string().min(1), conflictId: z.string().min(1) });

export async function deleteConflict(input: z.infer<typeof conflictRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = conflictRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedConflict(parsed.data.workspaceId, parsed.data.conflictId))) return notFound();

  await prisma.conflictOfInterest.delete({ where: { id: parsed.data.conflictId } });

  revalidate(parsed.data.workspaceId);
  return ok({ id: parsed.data.conflictId });
}

const addCourseSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  validityMonths: VALIDITY.optional(),
});

export async function addTrainingCourse(input: z.infer<typeof addCourseSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = addCourseSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, name } = parsed.data;
  if (await courseNameTaken(workspaceId, name)) return validationError(`A course named "${name}" already exists.`);

  const course = await prisma.trainingCourse.create({
    data: { workspaceId, name, validityMonths: parsed.data.validityMonths ?? null },
  });

  revalidate(workspaceId);
  return ok({ id: course.id });
}

const updateCourseSchema = z.object({
  workspaceId: z.string().min(1),
  courseId: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  validityMonths: VALIDITY.optional(),
});

/** Changing the validity period re-dates every completion of the course: the rule changed, not the history. */
export async function updateTrainingCourse(input: z.infer<typeof updateCourseSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = updateCourseSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, courseId, name, validityMonths } = parsed.data;
  if (!(await findOwnedCourse(workspaceId, courseId))) return notFound();
  if (name && (await courseNameTaken(workspaceId, name, courseId))) return validationError(`A course named "${name}" already exists.`);

  await prisma.trainingCourse.update({ where: { id: courseId }, data: { name, validityMonths } });

  revalidate(workspaceId);
  return ok({ id: courseId });
}

const courseRefSchema = z.object({ workspaceId: z.string().min(1), courseId: z.string().min(1) });

/** Deletes the course and every completion recorded against it. */
export async function deleteTrainingCourse(input: z.infer<typeof courseRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = courseRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  if (!(await findOwnedCourse(parsed.data.workspaceId, parsed.data.courseId))) return notFound();

  await prisma.trainingCourse.delete({ where: { id: parsed.data.courseId } });

  revalidate(parsed.data.workspaceId);
  return ok({ id: parsed.data.courseId });
}

const addCompletionSchema = z.object({
  workspaceId: z.string().min(1),
  courseId: z.string().min(1),
  personId: z.string().min(1),
  completedOn: z.iso.date(),
});

export async function addTrainingCompletion(input: z.infer<typeof addCompletionSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = addCompletionSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, courseId, personId } = parsed.data;
  if (!(await findOwnedCourse(workspaceId, courseId))) return notFound();
  const problem = await checkPerson(workspaceId, personId);
  if (problem) return problem;

  const completion = await prisma.trainingCompletion.create({
    data: { courseId, personId, completedOn: new Date(parsed.data.completedOn) },
  });

  revalidate(workspaceId);
  return ok({ id: completion.id });
}

const completionRefSchema = z.object({ workspaceId: z.string().min(1), completionId: z.string().min(1) });

export async function deleteTrainingCompletion(input: z.infer<typeof completionRefSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = completionRefSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const completion = await prisma.trainingCompletion.findUnique({
    where: { id: parsed.data.completionId },
    include: { course: { select: { workspaceId: true } } },
  });
  if (!completion || completion.course.workspaceId !== parsed.data.workspaceId) return notFound();

  await prisma.trainingCompletion.delete({ where: { id: completion.id } });

  revalidate(parsed.data.workspaceId);
  return ok({ id: completion.id });
}
