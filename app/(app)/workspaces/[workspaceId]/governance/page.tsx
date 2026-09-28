import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { buildAuthorityTableRows } from "@/lib/domain/authority-table";
import { buildCombinedMatrixRows, deriveControlPoints } from "@/lib/domain/process-report";
import { ProcessKpisControls } from "./process-kpis-controls";
import { GovernanceProfileForm } from "./governance-profile-form";
import { GovernanceAssessmentPanel, type AssessmentT, type ChecklistItemT } from "./governance-assessment-panel";
import type { PolicyT } from "./governance-policy-drawer";
import type { RiskT } from "./governance-risk-register";
import { AUTHORITY_ASSIGNMENT_INCLUDE, toAuthorityAssignmentData } from "@/lib/data/authority-assignments";
import { isPolicyOverdueForReview } from "@/lib/domain/policy-lifecycle";
import { dayOf, isChecklistItemOverdue } from "@/lib/domain/checklist-due";

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** ISO date-only (YYYY-MM-DD), for round-tripping through an `<input type="date">`. */
function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Governance across the whole engagement. Two things live here, side by
 * side but independent: the AI-assisted assessment (profile, five-pillar
 * summary, phased checklist, Risk Register, Policy Library — spec
 * 012-governance-generator) covers what no process derives on its own; Key
 * Control Points and KPIs, unchanged below, continue to summarise what
 * already exists in each process's Authority Matrix.
 */
export default async function GovernancePage(props: PageProps<"/workspaces/[workspaceId]/governance">) {
  const { workspaceId } = await props.params;

  const [workspace, roles, people, processes, aspects, assessments, risks, policies] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    prisma.role.findMany({ where: { workspaceId } }),
    prisma.person.findMany({ where: { workspaceId } }),
    prisma.process.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { code: "asc" } }),
    // A workspace's own aspects (spec 017) — the tabs themselves, addable,
    // renameable, and deletable; ordered oldest-first, so a newly added one
    // appends after the existing ones.
    prisma.governanceAspect.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.governanceAssessment.findMany({
      where: { workspaceId },
      include: { items: { include: { policy: true }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.governanceRisk.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    // Read straight off the workspace rather than walking every assessment's
    // items: a policy written by hand in the Policy Library has no checklist
    // item to be found through, and would be invisible if gathered that way.
    prisma.governancePolicyDraft.findMany({
      where: { workspaceId },
      include: {
        checklistItem: { select: { assessmentId: true } },
        approvedByUser: { select: { name: true, email: true } },
        versions: { orderBy: { versionNumber: "desc" }, include: { createdByUser: { select: { name: true, email: true } } } },
        acknowledgements: { include: { person: { select: { id: true, name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));
  // Roles and people are archived, never deleted, so an owner can be archived
  // after being assigned; it stays named, marked as such (spec 028).
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const ownerLabel = (owner: { name: string; archivedAt: Date | null } | undefined) =>
    owner ? `${owner.name}${owner.archivedAt ? " (archived)" : ""}` : null;
  const aspectNameById = new Map(aspects.map((a) => [a.id, a.name]));

  // One assessment id -> its aspect's id, so a policy or a risk sourced from
  // it can say which aspect it came from without a second query.
  const aspectIdByAssessmentId = new Map(assessments.map((a) => [a.id, a.aspectId]));

  // Every policy in the workspace, drafted or hand-written, each labelled with
  // the aspect whose assessment produced it — or null when nobody's
  // assessment did, which the library reads as "Added manually".
  const now = new Date();
  const allPolicies: PolicyT[] = policies.map((policy) => {
    const assessmentId = policy.checklistItem?.assessmentId;
    const aspectId = assessmentId ? aspectIdByAssessmentId.get(assessmentId) : undefined;
    return {
      id: policy.id,
      title: policy.title,
      body: policy.body,
      status: policy.status,
      focusAreaLabel: aspectId ? (aspectNameById.get(aspectId) ?? null) : null,
      focusArea: aspectId ?? null,
      updatedAt: formatDate(policy.updatedAt),
      lifecycleStatus: policy.lifecycleStatus,
      approvedByUserName: policy.approvedByUser ? (policy.approvedByUser.name ?? policy.approvedByUser.email) : null,
      approvedAt: policy.approvedAt ? formatDate(policy.approvedAt) : null,
      effectiveDate: policy.effectiveDate ? formatDate(policy.effectiveDate) : null,
      reviewDueDate: policy.reviewDueDate ? formatDateOnly(policy.reviewDueDate) : null,
      needsReview: isPolicyOverdueForReview(policy.lifecycleStatus, policy.reviewDueDate, now),
      versions: policy.versions.map((v) => ({
        versionNumber: v.versionNumber,
        title: v.title,
        body: v.body,
        authorName: v.createdByUser.name ?? v.createdByUser.email,
        createdAt: formatDate(v.createdAt),
      })),
      acknowledgements: policy.acknowledgements.map((a) => ({
        personId: a.personId,
        personName: a.person.name,
        acknowledgedAt: formatDate(a.acknowledgedAt),
      })),
    };
  });
  const policyById = new Map(allPolicies.map((p) => [p.id, p]));

  const assessmentsByAspectId: Record<string, AssessmentT> = {};
  for (const assessment of assessments) {
    const items: ChecklistItemT[] = assessment.items.map((item) => {
      return {
        id: item.id,
        phase: item.phase,
        title: item.title,
        description: item.description,
        status: item.status,
        // The same object the library holds, so the drawer opens one policy
        // whichever side it was reached from.
        policy: item.policy ? (policyById.get(item.policy.id) ?? null) : null,
        ownerRoleId: item.ownerRoleId,
        ownerPersonId: item.ownerPersonId,
        ownerLabel: item.ownerRoleId
          ? ownerLabel(roleById.get(item.ownerRoleId))
          : item.ownerPersonId
            ? ownerLabel(personById.get(item.ownerPersonId))
            : null,
        dueDate: item.dueDate ? dayOf(item.dueDate) : null,
        overdue: isChecklistItemOverdue(item.status, item.dueDate, now),
      };
    });
    assessmentsByAspectId[assessment.aspectId] = {
      id: assessment.id,
      summary: assessment.summary,
      updatedAtLabel: formatDate(assessment.updatedAt),
      items,
    };
  }

  const risksForPanel: RiskT[] = risks.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    likelihood: r.likelihood,
    impact: r.impact,
    status: r.status,
    ownerLabel: r.ownerRoleId
      ? (roleNameById.get(r.ownerRoleId) ?? null)
      : r.ownerPersonId
        ? (personNameById.get(r.ownerPersonId) ?? null)
        : null,
    // Resolved below, via each risk's sourceItem -> assessment -> aspect.
    sourceLabel: null as string | null,
    sourceFocusArea: null as string | null,
  }));

  // A risk's sourceLabel names the aspect of the assessment that surfaced
  // it, found via its sourceItem's own assessment — a second pass because
  // that lookup needs the checklist item, not just the risk row.
  if (risks.some((r) => r.sourceItemId)) {
    const sourceItems = await prisma.governanceChecklistItem.findMany({
      where: { id: { in: risks.map((r) => r.sourceItemId).filter((id): id is string => id !== null) } },
      select: { id: true, assessmentId: true },
    });
    const assessmentIdByItemId = new Map(sourceItems.map((i) => [i.id, i.assessmentId]));
    risks.forEach((r, i) => {
      if (!r.sourceItemId) return;
      const assessmentId = assessmentIdByItemId.get(r.sourceItemId);
      const aspectId = assessmentId ? aspectIdByAssessmentId.get(assessmentId) : undefined;
      if (aspectId) {
        risksForPanel[i]!.sourceLabel = aspectNameById.get(aspectId) ?? null;
        risksForPanel[i]!.sourceFocusArea = aspectId;
      }
    });
  }

  const hasProfile = Boolean(
    workspace.industry?.trim() && workspace.governanceCompanySize?.trim() && workspace.governanceJurisdiction?.trim()
  );

  const roleNameByIdForControlPoints = roleNameById;
  const sections = await Promise.all(
    processes.map(async (process) => {
      const [steps, activities, authorityAssignments] = await Promise.all([
        prisma.processStep.findMany({ where: { processId: process.id }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
        prisma.activity.findMany({
          where: { processId: process.id },
          include: { raciAssignments: true },
          orderBy: { order: "asc" },
        }),
        prisma.authorityAssignment.findMany({ where: { processId: process.id }, include: AUTHORITY_ASSIGNMENT_INCLUDE }),
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
        authorityAssignments.map(toAuthorityAssignmentData)
      );

      return {
        id: process.id,
        code: process.code,
        name: process.name,
        kpis: process.kpis as unknown as { metric: string; target: string; frequency: string }[],
        controlPoints: deriveControlPoints(buildCombinedMatrixRows(raciRows, authorityRows), roleNameByIdForControlPoints),
      };
    })
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <WorkspacePageHeader
        title="Governance, Controls & Metrics"
        subtitle="An AI-assisted assessment covers board structure, risk & controls, ethics, compensation, ESG, data integrity and accessibility. Key Control Points and KPIs below continue to come from each process's Authority Matrix."
      />

      <div className="mb-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <GovernanceProfileForm
            workspaceId={workspaceId}
            industry={workspace.industry}
            companySize={workspace.governanceCompanySize}
            jurisdiction={workspace.governanceJurisdiction}
          />
        </div>
      </div>

      <div className="mb-6">
        <GovernanceAssessmentPanel
          workspaceId={workspaceId}
          hasProfile={hasProfile}
          aspects={aspects.map((a) => ({ id: a.id, name: a.name }))}
          assessmentsByAspectId={assessmentsByAspectId}
          risks={risksForPanel}
          allPolicies={allPolicies}
          people={people.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
          roles={roles.map((r) => ({ id: r.id, name: r.name, archived: r.archivedAt !== null }))}
        />
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
        <div className="h-px flex-1 bg-slate-200" />
        Key Control Points &amp; KPIs, from each process&apos;s Authority Matrix
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
          No processes yet in {workspace.name}.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <ProcessKpisControls
              key={section.id}
              workspaceId={workspaceId}
              processId={section.id}
              processCode={section.code}
              processName={section.name}
              kpis={section.kpis}
              controlPoints={section.controlPoints}
            />
          ))}
        </div>
      )}
    </main>
  );
}
