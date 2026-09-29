"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { logGovernanceActivity } from "@/lib/data/governance-activity";
import { runGoverningPolicyDraft } from "@/lib/ai/governance-generator";
import { findTemplate, fillTemplate } from "@/lib/domain/policy-templates";
import { ok, notFound, validationError, aiUnavailable, type ActionResult } from "@/lib/actions/errors";

/**
 * Each aspect's governing policy (spec 029): an ordinary Policy Library
 * policy linked to one aspect. The link is unique both ways, so an aspect has
 * at most one and a policy governs at most one. Nothing here deletes a
 * policy; the lifecycle (spec 018) applies to it unchanged. EDITOR writes.
 */

const revalidate = (workspaceId: string) => revalidatePath(`/workspaces/${workspaceId}/governance`);

async function findOwnedAspect(workspaceId: string, aspectId: string) {
  const aspect = await prisma.governanceAspect.findUnique({
    where: { id: aspectId },
    include: { governingPolicy: { select: { id: true, title: true } } },
  });
  return aspect && aspect.workspaceId === workspaceId ? aspect : null;
}

const setSchema = z.object({
  workspaceId: z.string().min(1),
  aspectId: z.string().min(1),
  /** null removes the designation. */
  policyId: z.string().min(1).nullable(),
});

/** Designates, replaces or removes an aspect's governing policy. The policies themselves stay in the library. */
export async function setGoverningPolicy(input: z.infer<typeof setSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, aspectId, policyId } = parsed.data;
  const aspect = await findOwnedAspect(workspaceId, aspectId);
  if (!aspect) return notFound();
  const current = aspect.governingPolicy;
  const actorUserId = access.data.userId;

  if (policyId === null) {
    if (current) {
      await prisma.$transaction([
        prisma.governancePolicyDraft.update({ where: { id: current.id }, data: { governsAspectId: null } }),
        logGovernanceActivity(prisma, {
          workspaceId,
          entityType: "POLICY",
          entityId: current.id,
          entityLabel: current.title,
          summary: `Removed as governing policy for ${aspect.name}`,
          actorUserId,
        }),
      ]);
      revalidate(workspaceId);
    }
    return ok({ id: aspectId });
  }

  const policy = await prisma.governancePolicyDraft.findUnique({
    where: { id: policyId },
    include: { governsAspect: { select: { id: true, name: true } } },
  });
  if (!policy || policy.workspaceId !== workspaceId) return notFound();
  if (policy.governsAspect?.id === aspectId) return ok({ id: aspectId });
  if (policy.governsAspect) {
    return validationError(
      `"${policy.title}" already governs ${policy.governsAspect.name}. Remove it there first.`
    );
  }

  await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.governancePolicyDraft.update({ where: { id: current.id }, data: { governsAspectId: null } });
      await logGovernanceActivity(tx, {
        workspaceId,
        entityType: "POLICY",
        entityId: current.id,
        entityLabel: current.title,
        summary: `Replaced as governing policy for ${aspect.name}`,
        actorUserId,
      });
    }
    await tx.governancePolicyDraft.update({ where: { id: policy.id }, data: { governsAspectId: aspectId } });
    await logGovernanceActivity(tx, {
      workspaceId,
      entityType: "POLICY",
      entityId: policy.id,
      entityLabel: policy.title,
      summary: `Set as governing policy for ${aspect.name}`,
      actorUserId,
    });
  });

  revalidate(workspaceId);
  return ok({ id: aspectId });
}

/** Creates a Draft already linked to the aspect, with version 1, and logs it. */
async function createLinkedPolicy(params: {
  workspaceId: string;
  aspectId: string;
  aspectName: string;
  title: string;
  body: string;
  actorUserId: string;
  source: string;
}) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.governancePolicyDraft.create({
      data: {
        workspaceId: params.workspaceId,
        governsAspectId: params.aspectId,
        title: params.title,
        body: params.body,
        status: "EDITED",
        handManaged: true,
      },
    });
    await tx.governancePolicyVersion.create({
      data: { policyId: created.id, versionNumber: 1, title: created.title, body: created.body, createdByUserId: params.actorUserId },
    });
    await logGovernanceActivity(tx, {
      workspaceId: params.workspaceId,
      entityType: "POLICY",
      entityId: created.id,
      entityLabel: created.title,
      summary: `Added as governing policy for ${params.aspectName} (${params.source})`,
      actorUserId: params.actorUserId,
    });
    return created;
  });
}

const alreadyGoverned = (aspectName: string, title: string) =>
  validationError(`${aspectName} already has a governing policy ("${title}"). Remove it first to start a new one.`);

const createSchema = z.union([
  z.object({ workspaceId: z.string().min(1), aspectId: z.string().min(1), templateId: z.string().min(1) }),
  z.object({
    workspaceId: z.string().min(1),
    aspectId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1),
  }),
]);

/** Starts an aspect's governing policy from a built-in template, or from a title and body written by hand. */
export async function createGoverningPolicy(input: z.infer<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, aspectId } = parsed.data;
  const aspect = await findOwnedAspect(workspaceId, aspectId);
  if (!aspect) return notFound();
  if (aspect.governingPolicy) return alreadyGoverned(aspect.name, aspect.governingPolicy.title);

  let content: { title: string; body: string };
  let source: string;
  if ("templateId" in parsed.data) {
    const found = findTemplate(parsed.data.templateId);
    if (!found) return validationError("That template doesn't exist.");
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } });
    content = fillTemplate(found, workspace.name);
    source = "from template";
  } else {
    content = { title: parsed.data.title, body: parsed.data.body };
    source = "written by hand";
  }

  const created = await createLinkedPolicy({
    workspaceId,
    aspectId,
    aspectName: aspect.name,
    ...content,
    actorUserId: access.data.userId,
    source,
  });

  revalidate(workspaceId);
  return ok({ id: created.id });
}

const draftSchema = z.object({ workspaceId: z.string().min(1), aspectId: z.string().min(1) });

/** Has the AI draft an aspect's governing policy for this client. Needs the governance profile, like the assessment. */
export async function draftGoverningPolicyWithAi(input: z.infer<typeof draftSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, aspectId } = parsed.data;
  const [workspace, aspect] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
    findOwnedAspect(workspaceId, aspectId),
  ]);
  if (!workspace || !aspect) return notFound();
  if (aspect.governingPolicy) return alreadyGoverned(aspect.name, aspect.governingPolicy.title);

  if (!workspace.industry?.trim() || !workspace.governanceCompanySize?.trim() || !workspace.governanceJurisdiction?.trim()) {
    return validationError("Set this workspace's company size, industry, and jurisdiction before drafting a policy with AI.");
  }

  const outcome = await runGoverningPolicyDraft(
    [
      `Company: ${workspace.name}`,
      `Company size: ${workspace.governanceCompanySize}`,
      `Industry/sector: ${workspace.industry}`,
      `Jurisdiction: ${workspace.governanceJurisdiction}`,
      `Governance area to draft the governing policy for: ${aspect.name}`,
    ].join("\n")
  );
  if (!outcome.ok) {
    if (outcome.reason === "NOT_CONFIGURED") return aiUnavailable(outcome.message);
    return validationError(outcome.message);
  }

  const created = await createLinkedPolicy({
    workspaceId,
    aspectId,
    aspectName: aspect.name,
    title: outcome.data.title,
    body: outcome.data.body,
    actorUserId: access.data.userId,
    source: "drafted with AI",
  });

  revalidate(workspaceId);
  return ok({ id: created.id });
}
