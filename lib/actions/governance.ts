"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { runGovernanceAssessment } from "@/lib/ai/governance-generator";
import {
  normalizeFindingTitle,
  partitionNewChecklistItems,
  partitionNewRisks,
} from "@/lib/domain/governance-findings";
import { ok, notFound, validationError, aiUnavailable, type ActionResult } from "@/lib/actions/errors";
import type {
  GovernanceFocusArea,
  GovernanceItemPhase,
  GovernanceItemStatus,
  RiskLikelihood,
  RiskImpact,
  RiskStatus,
} from "@/app/generated/prisma/client";

import {
  GOVERNANCE_FOCUS_AREAS,
  GOVERNANCE_FOCUS_AREA_LABEL,
  type GovernanceFocusAreaValue,
} from "@/lib/domain/governance-focus-areas";

const FOCUS_AREAS = GOVERNANCE_FOCUS_AREAS.map((f) => f.value) as [
  GovernanceFocusAreaValue,
  ...GovernanceFocusAreaValue[],
];
const FOCUS_AREA_LABEL = GOVERNANCE_FOCUS_AREA_LABEL;

/**
 * Sets a workspace's governance profile — company size and jurisdiction,
 * alongside the industry field the workspace already has (FR-001). A
 * workspace-level write, gated the same as every other one.
 */
const setGovernanceProfileSchema = z.object({
  workspaceId: z.string().min(1),
  companySize: z.string().min(1),
  jurisdiction: z.string().min(1),
});

export async function setGovernanceProfile(
  input: z.infer<typeof setGovernanceProfileSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = setGovernanceProfileSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid governance profile", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const workspace = await prisma.workspace.update({
    where: { id: parsed.data.workspaceId },
    data: {
      governanceCompanySize: parsed.data.companySize,
      governanceJurisdiction: parsed.data.jurisdiction,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: workspace.id });
}

/**
 * Generates (or regenerates) a governance assessment for one focus area
 * (FR-002). Gathers the workspace's profile and industry, this focus area's
 * already-tracked checklist item titles and every risk already on the
 * workspace's register (FR-011's risk register is not focus-area-scoped, so
 * its reconciliation set is workspace-wide — see governance-findings.ts's
 * partitionNewRisks), calls the model, reconciles the result so a
 * done/dismissed item, an edited policy, or a hand-scored risk is never
 * silently overwritten (FR-007/FR-014), and persists only what's genuinely
 * new.
 */
const generateAssessmentSchema = z.object({
  workspaceId: z.string().min(1),
  focusArea: z.enum(FOCUS_AREAS),
});

export async function generateGovernanceAssessment(
  input: z.infer<typeof generateAssessmentSchema>
): Promise<ActionResult<{ assessmentId: string }>> {
  const parsed = generateAssessmentSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, focusArea } = parsed.data;

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return notFound();

  // FR-003: refuse rather than generate a generic, industry-blind result.
  if (!workspace.industry?.trim() || !workspace.governanceCompanySize?.trim() || !workspace.governanceJurisdiction?.trim()) {
    return validationError(
      "Set this workspace's company size, industry, and jurisdiction before generating a governance assessment."
    );
  }

  const [existingAssessment, allWorkspaceRisks] = await Promise.all([
    prisma.governanceAssessment.findUnique({
      where: { workspaceId_focusArea: { workspaceId, focusArea: focusArea as GovernanceFocusArea } },
      include: { items: true },
    }),
    prisma.governanceRisk.findMany({ where: { workspaceId } }),
  ]);

  const trackedChecklistTitles = new Set(
    (existingAssessment?.items ?? []).map((i) => normalizeFindingTitle(i.title))
  );
  // Workspace-wide, not scoped to this assessment's own items — a risk found
  // assessing Risk & Controls must not be free to reappear when Board
  // Structure is generated next.
  const trackedRiskTitles = new Set(allWorkspaceRisks.map((r) => normalizeFindingTitle(r.title)));

  const promptText = buildGovernancePrompt({
    companySize: workspace.governanceCompanySize,
    industry: workspace.industry,
    jurisdiction: workspace.governanceJurisdiction,
    focusAreaLabel: FOCUS_AREA_LABEL[focusArea],
    alreadyTrackedChecklistTitles: [...trackedChecklistTitles],
    alreadyTrackedRiskTitles: [...trackedRiskTitles],
  });

  const outcome = await runGovernanceAssessment(promptText);
  if (!outcome.ok) {
    if (outcome.reason === "NOT_CONFIGURED") return aiUnavailable(outcome.message);
    return validationError(outcome.message);
  }

  const newItems = partitionNewChecklistItems(outcome.data.checklist, trackedChecklistTitles);
  const newRisks = partitionNewRisks(outcome.data.risks, trackedRiskTitles);
  const policyByTitle = new Map(
    outcome.data.policies.map((p) => [normalizeFindingTitle(p.title), p] as const)
  );
  const riskByTitle = new Map(newRisks.map((r) => [normalizeFindingTitle(r.title), r] as const));

  const assessmentId = await prisma.$transaction(async (tx) => {
    const assessment = await tx.governanceAssessment.upsert({
      where: { workspaceId_focusArea: { workspaceId, focusArea: focusArea as GovernanceFocusArea } },
      update: { summary: outcome.data.summary },
      create: { workspaceId, focusArea: focusArea as GovernanceFocusArea, summary: outcome.data.summary },
    });

    for (const item of newItems) {
      const created = await tx.governanceChecklistItem.create({
        data: {
          assessmentId: assessment.id,
          phase: item.phase.toUpperCase().replace("-", "_") as GovernanceItemPhase,
          title: item.title,
          description: item.description,
        },
      });

      const policyTitle = item.policyTitle ? normalizeFindingTitle(item.policyTitle) : null;
      const policy = policyTitle ? policyByTitle.get(policyTitle) : undefined;
      if (policy) {
        await tx.governancePolicyDraft.create({
          data: { workspaceId, checklistItemId: created.id, title: policy.title, body: policy.body },
        });
      }

      // Only a risk this run is actually introducing (present in `newRisks`)
      // gets linked as sourceItemId here — a risk the item names that already
      // exists on the register (tracked) stays exactly as it is; linking it
      // to a freshly-created item would silently move its provenance.
      const riskTitle = item.riskTitle ? normalizeFindingTitle(item.riskTitle) : null;
      const risk = riskTitle ? riskByTitle.get(riskTitle) : undefined;
      if (risk && riskTitle) {
        await tx.governanceRisk.create({
          data: {
            workspaceId,
            sourceItemId: created.id,
            title: risk.title,
            description: risk.description,
            likelihood: risk.likelihood.toUpperCase() as RiskLikelihood,
            impact: risk.impact.toUpperCase() as RiskImpact,
          },
        });
        riskByTitle.delete(riskTitle); // created once, even if two items name it
      }
    }

    // Any new risk no checklist item claimed (named by riskByTitle but never
    // consumed above) is still a real finding — create it unlinked rather
    // than dropping it because no item happened to reference it by title.
    for (const risk of riskByTitle.values()) {
      await tx.governanceRisk.create({
        data: {
          workspaceId,
          title: risk.title,
          description: risk.description,
          likelihood: risk.likelihood.toUpperCase() as RiskLikelihood,
          impact: risk.impact.toUpperCase() as RiskImpact,
        },
      });
    }

    return assessment.id;
  });

  revalidatePath(`/workspaces/${workspaceId}/governance`);
  return ok({ assessmentId });
}

function buildGovernancePrompt(params: {
  companySize: string;
  industry: string;
  jurisdiction: string;
  focusAreaLabel: string;
  alreadyTrackedChecklistTitles: string[];
  alreadyTrackedRiskTitles: string[];
}): string {
  const lines = [
    `Company size: ${params.companySize}`,
    `Industry/sector: ${params.industry}`,
    `Jurisdiction: ${params.jurisdiction}`,
    `Governance focus area: ${params.focusAreaLabel}`,
  ];
  if (params.alreadyTrackedChecklistTitles.length > 0) {
    lines.push(
      `Checklist items already tracked for this focus area — do not repeat these, focus on what's missing: ${params.alreadyTrackedChecklistTitles.join("; ")}`
    );
  }
  if (params.alreadyTrackedRiskTitles.length > 0) {
    lines.push(
      `Risks already on this company's register — do not repeat these: ${params.alreadyTrackedRiskTitles.join("; ")}`
    );
  }
  return lines.join("\n");
}

/**
 * Marks a checklist item done, dismissed, or back to open (FR-006).
 * Independent of any run — status is never touched by generation once set.
 */
const setChecklistItemStatusSchema = z.object({
  workspaceId: z.string().min(1),
  itemId: z.string().min(1),
  status: z.enum(["OPEN", "DONE", "DISMISSED"]),
});

export async function setChecklistItemStatus(
  input: z.infer<typeof setChecklistItemStatusSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = setChecklistItemStatusSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const item = await prisma.governanceChecklistItem.findUnique({
    where: { id: parsed.data.itemId },
    include: { assessment: true },
  });
  if (!item || item.assessment.workspaceId !== parsed.data.workspaceId) return notFound();

  await prisma.governanceChecklistItem.update({
    where: { id: parsed.data.itemId },
    data: { status: parsed.data.status as GovernanceItemStatus },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: parsed.data.itemId });
}

/**
 * Adds a governance action straight to a focus area's checklist, with no
 * assessment run behind it — the same parity addGovernancePolicy and
 * addGovernanceRisk give a hand-written policy or risk. A consultant who
 * already knows what a client needs to do next should not have to run an AI
 * assessment first to have somewhere to put it.
 *
 * A checklist item's assessmentId is required (unlike a policy's optional
 * checklistItemId), so this upserts the focus area's assessment shell —
 * summary "" — the first time it gets a hand-written item before ever being
 * generated. No extra protection is needed against a later regenerate:
 * partitionNewChecklistItems already treats every existing title as tracked
 * regardless of who created it (governance-findings.ts).
 */
const addChecklistItemSchema = z.object({
  workspaceId: z.string().min(1),
  focusArea: z.enum(FOCUS_AREAS),
  phase: z.enum(["IMMEDIATE", "NEAR_TERM", "LONG_TERM"]),
  title: z.string().min(1),
  description: z.string().min(1),
});

export async function addGovernanceChecklistItem(
  input: z.infer<typeof addChecklistItemSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = addChecklistItemSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, focusArea, phase, title, description } = parsed.data;

  const item = await prisma.$transaction(async (tx) => {
    const assessment = await tx.governanceAssessment.upsert({
      where: { workspaceId_focusArea: { workspaceId, focusArea: focusArea as GovernanceFocusArea } },
      update: {},
      create: { workspaceId, focusArea: focusArea as GovernanceFocusArea, summary: "" },
    });

    return tx.governanceChecklistItem.create({
      data: { assessmentId: assessment.id, phase: phase as GovernanceItemPhase, title, description },
    });
  });

  revalidatePath(`/workspaces/${workspaceId}/governance`);
  return ok({ id: item.id });
}

/**
 * Edits a checklist item's phase, title, or description by hand. Status is
 * untouched here — setChecklistItemStatus owns that — so editing an item's
 * text never reopens a DONE one or un-dismisses a DISMISSED one.
 */
const updateChecklistItemSchema = z.object({
  workspaceId: z.string().min(1),
  itemId: z.string().min(1),
  phase: z.enum(["IMMEDIATE", "NEAR_TERM", "LONG_TERM"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export async function updateGovernanceChecklistItem(
  input: z.infer<typeof updateChecklistItemSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateChecklistItemSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const item = await prisma.governanceChecklistItem.findUnique({
    where: { id: parsed.data.itemId },
    include: { assessment: true },
  });
  if (!item || item.assessment.workspaceId !== parsed.data.workspaceId) return notFound();

  const fields = parsed.data;

  await prisma.governanceChecklistItem.update({
    where: { id: parsed.data.itemId },
    data: {
      ...(fields.phase !== undefined ? { phase: fields.phase as GovernanceItemPhase } : {}),
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.description !== undefined ? { description: fields.description } : {}),
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: parsed.data.itemId });
}

/**
 * Removes a checklist item outright — distinct from setChecklistItemStatus's
 * Dismiss, which keeps the row (and the reason a re-run won't recreate it)
 * around. A manually-added item that turned out to be a mistake has no such
 * history worth keeping.
 *
 * Cascades to the item's own linked policy draft, exactly as the schema
 * already does for a generated item (GovernancePolicyDraft.checklistItem is
 * onDelete: Cascade); a linked risk survives (SetNull), same as it does for
 * a generated item's deletion.
 */
const deleteChecklistItemSchema = z.object({
  workspaceId: z.string().min(1),
  itemId: z.string().min(1),
});

export async function deleteGovernanceChecklistItem(
  input: z.infer<typeof deleteChecklistItemSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteChecklistItemSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const item = await prisma.governanceChecklistItem.findUnique({
    where: { id: parsed.data.itemId },
    include: { assessment: true },
  });
  if (!item || item.assessment.workspaceId !== parsed.data.workspaceId) return notFound();

  await prisma.governanceChecklistItem.delete({ where: { id: parsed.data.itemId } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: parsed.data.itemId });
}

/**
 * Saves an edited policy draft (FR-006). Setting the body also marks it
 * hand-managed and sets status to EDITED, which is what protects it from a
 * later regeneration (governance-findings.ts's isHandManaged) — SC-004.
 *
 * The title is editable too, so a policy written by hand can be renamed;
 * omitting it leaves the drafted title alone.
 */
const updatePolicyDraftSchema = z.object({
  workspaceId: z.string().min(1),
  policyId: z.string().min(1),
  title: z.string().min(1).optional(),
  body: z.string().min(1),
});

export async function updatePolicyDraft(
  input: z.infer<typeof updatePolicyDraftSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updatePolicyDraftSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  // Read the workspace off the policy itself: one written by hand has no
  // checklist item to reach an assessment through.
  const policy = await prisma.governancePolicyDraft.findUnique({ where: { id: parsed.data.policyId } });
  if (!policy || policy.workspaceId !== parsed.data.workspaceId) return notFound();

  await prisma.governancePolicyDraft.update({
    where: { id: parsed.data.policyId },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      body: parsed.data.body,
      status: "EDITED",
      handManaged: true,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: parsed.data.policyId });
}

/**
 * Writes a policy straight into the Policy Library, with no assessment
 * behind it — the same parity addGovernanceRisk gives a hand-added risk
 * (FR-012). A consultant who already knows the client needs a policy should
 * not have to generate an assessment to get somewhere to put it.
 */
const addPolicySchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
});

export async function addGovernancePolicy(
  input: z.infer<typeof addPolicySchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = addPolicySchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const policy = await prisma.governancePolicyDraft.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      title: parsed.data.title,
      body: parsed.data.body,
      status: "EDITED",
      handManaged: true,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: policy.id });
}

/** Removes a policy from the library, whoever wrote it. */
const deletePolicySchema = z.object({
  workspaceId: z.string().min(1),
  policyId: z.string().min(1),
});

export async function deleteGovernancePolicy(
  input: z.infer<typeof deletePolicySchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = deletePolicySchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const policy = await prisma.governancePolicyDraft.findUnique({ where: { id: parsed.data.policyId } });
  if (!policy || policy.workspaceId !== parsed.data.workspaceId) return notFound();

  await prisma.governancePolicyDraft.delete({ where: { id: parsed.data.policyId } });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: parsed.data.policyId });
}

/** Adds a risk directly to the register (FR-011/FR-012) — tracked exactly like an AI-surfaced one. */
const addRiskSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  likelihood: z.enum(["LOW", "MEDIUM", "HIGH"]),
  impact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

export async function addGovernanceRisk(
  input: z.infer<typeof addRiskSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = addRiskSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const risk = await prisma.governanceRisk.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      title: parsed.data.title,
      description: parsed.data.description,
      likelihood: parsed.data.likelihood as RiskLikelihood,
      impact: parsed.data.impact as RiskImpact,
      handManaged: true,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: risk.id });
}

/**
 * Updates a risk's score, status, or owner (FR-011/SC-006). Any field
 * omitted is left unchanged. Setting any field marks the risk hand-managed,
 * protecting it from FR-014's reconciliation the same way updatePolicyDraft
 * protects a policy — see governance-findings.ts's isHandManaged.
 */
const updateRiskSchema = z.object({
  workspaceId: z.string().min(1),
  riskId: z.string().min(1),
  status: z.enum(["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"]).optional(),
  likelihood: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  impact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  ownerRoleId: z.string().min(1).nullable().optional(),
  ownerPersonId: z.string().min(1).nullable().optional(),
});

export async function updateGovernanceRisk(
  input: z.infer<typeof updateRiskSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateRiskSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const risk = await prisma.governanceRisk.findUnique({ where: { id: parsed.data.riskId } });
  if (!risk || risk.workspaceId !== parsed.data.workspaceId) return notFound();

  const { workspaceId: _workspaceId, riskId: _riskId, ...fields } = parsed.data;
  void _workspaceId;
  void _riskId;

  await prisma.governanceRisk.update({
    where: { id: parsed.data.riskId },
    data: {
      ...(fields.status !== undefined ? { status: fields.status as RiskStatus } : {}),
      ...(fields.likelihood !== undefined ? { likelihood: fields.likelihood as RiskLikelihood } : {}),
      ...(fields.impact !== undefined ? { impact: fields.impact as RiskImpact } : {}),
      ...(fields.ownerRoleId !== undefined ? { ownerRoleId: fields.ownerRoleId } : {}),
      ...(fields.ownerPersonId !== undefined ? { ownerPersonId: fields.ownerPersonId } : {}),
      handManaged: true,
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/governance`);
  return ok({ id: parsed.data.riskId });
}
