"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import {
  resolveApprovers,
  validateApprovalRules,
  type ApprovalRule,
  type ApproverResolution,
  type ApprovalRuleIssue,
} from "@/lib/domain/authority-resolution";
import { ok, validationError, type ActionResult } from "@/lib/actions/errors";

const createDecisionTypeSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});

export async function createDecisionType(
  input: z.infer<typeof createDecisionTypeSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createDecisionTypeSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const decisionType = await prisma.decisionType.create({
    data: { workspaceId: parsed.data.workspaceId, name: parsed.data.name },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/authority`);
  return ok({ id: decisionType.id });
}

const createRuleSchema = z
  .object({
    workspaceId: z.string().min(1),
    decisionTypeId: z.string().min(1),
    approverRoleId: z.string().min(1).optional(),
    approverPersonId: z.string().min(1).optional(),
    maxThreshold: z.number().positive(),
    coApprovalAboveThreshold: z.number().positive().optional(),
    coApprovalRoleId: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.approverRoleId) !== Boolean(v.approverPersonId), {
    message: "Exactly one of approverRoleId or approverPersonId must be set",
  });

export async function createApprovalRule(
  input: z.infer<typeof createRuleSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createRuleSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid rule input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const rule = await prisma.approvalRule.create({
    data: {
      decisionTypeId: parsed.data.decisionTypeId,
      approverRoleId: parsed.data.approverRoleId,
      approverPersonId: parsed.data.approverPersonId,
      maxThreshold: parsed.data.maxThreshold,
      coApprovalAboveThreshold: parsed.data.coApprovalAboveThreshold,
      coApprovalRoleId: parsed.data.coApprovalRoleId,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/authority`);
  return ok({ id: rule.id });
}

const deleteRuleSchema = z.object({
  workspaceId: z.string().min(1),
  ruleId: z.string().min(1),
});

export async function deleteApprovalRule(
  input: z.infer<typeof deleteRuleSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteRuleSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  await prisma.approvalRule.delete({ where: { id: parsed.data.ruleId } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/authority`);
  return ok({ id: parsed.data.ruleId });
}

async function loadRules(decisionTypeId: string): Promise<ApprovalRule[]> {
  const rules = await prisma.approvalRule.findMany({
    where: { decisionTypeId },
    include: { approverRole: true, approverPerson: true, coApproverRole: true },
  });

  return rules.map((r) => ({
    id: r.id,
    approverLabel: r.approverRole?.name ?? r.approverPerson?.name ?? "Unknown",
    maxThreshold: Number(r.maxThreshold),
    coApprovalAboveThreshold: r.coApprovalAboveThreshold ? Number(r.coApprovalAboveThreshold) : null,
    coApproverLabel: r.coApproverRole?.name ?? null,
  }));
}

const decisionTypeIdSchema = z.object({
  workspaceId: z.string().min(1),
  decisionTypeId: z.string().min(1),
});

export async function validateAuthorityMatrix(
  input: z.infer<typeof decisionTypeIdSchema>
): Promise<ActionResult<{ issues: ApprovalRuleIssue[] }>> {
  const parsed = decisionTypeIdSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "VIEWER");
  if (!access.ok) return access;

  const rules = await loadRules(parsed.data.decisionTypeId);
  return ok({ issues: validateApprovalRules(rules) });
}

const queryApproversSchema = z.object({
  workspaceId: z.string().min(1),
  decisionTypeId: z.string().min(1),
  value: z.number().nonnegative(),
});

export async function queryApprovers(
  input: z.infer<typeof queryApproversSchema>
): Promise<ActionResult<ApproverResolution>> {
  const parsed = queryApproversSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid query", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "VIEWER");
  if (!access.ok) return access;

  const rules = await loadRules(parsed.data.decisionTypeId);
  return ok(resolveApprovers(rules, parsed.data.value));
}
