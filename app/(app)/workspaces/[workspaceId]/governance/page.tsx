import { prisma } from "@/lib/db/client";
import { WorkspacePageHeader } from "../workspace-page-header";
import { buildRaciTableRows } from "@/lib/domain/raci-table";
import { buildAuthorityTableRows } from "@/lib/domain/authority-table";
import { buildCombinedMatrixRows, deriveControlPoints } from "@/lib/domain/process-report";
import { GOVERNANCE_FOCUS_AREA_LABEL } from "@/lib/domain/governance-focus-areas";
import { ProcessKpisControls } from "./process-kpis-controls";
import { GovernanceProfileForm } from "./governance-profile-form";
import { GovernanceAssessmentPanel, type AssessmentT, type ChecklistItemT } from "./governance-assessment-panel";
import type { PolicyT } from "./governance-policy-drawer";
import type { RiskT } from "./governance-risk-register";
import { AUTHORITY_ASSIGNMENT_INCLUDE, toAuthorityAssignmentData } from "@/lib/data/authority-assignments";

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

  const [workspace, roles, people, processes, assessments, risks] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    prisma.role.findMany({ where: { workspaceId } }),
    prisma.person.findMany({ where: { workspaceId } }),
    prisma.process.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { code: "asc" } }),
    prisma.governanceAssessment.findMany({
      where: { workspaceId },
      include: { items: { include: { policy: true }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.governanceRisk.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));

  // One assessment id -> its focus area's label, so a policy or a risk
  // sourced from it can say which area it came from without a second query.
  const focusAreaByAssessmentId = new Map(assessments.map((a) => [a.id, a.focusArea]));

  const assessmentsByFocusArea: Record<string, AssessmentT> = {};
  const allPolicies: PolicyT[] = [];
  for (const assessment of assessments) {
    const items: ChecklistItemT[] = assessment.items.map((item) => {
      if (item.policy) {
        allPolicies.push({
          id: item.policy.id,
          title: item.policy.title,
          body: item.policy.body,
          status: item.policy.status,
          focusAreaLabel: GOVERNANCE_FOCUS_AREA_LABEL[assessment.focusArea],
          updatedAt: formatDate(item.policy.updatedAt),
        });
      }
      return {
        id: item.id,
        phase: item.phase,
        title: item.title,
        description: item.description,
        status: item.status,
        policy: item.policy
          ? {
              id: item.policy.id,
              title: item.policy.title,
              body: item.policy.body,
              status: item.policy.status,
              focusAreaLabel: GOVERNANCE_FOCUS_AREA_LABEL[assessment.focusArea],
              updatedAt: formatDate(item.policy.updatedAt),
            }
          : null,
      };
    });
    assessmentsByFocusArea[assessment.focusArea] = {
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
    // Resolved below, via each risk's sourceItem -> assessment -> focus area.
    sourceLabel: null as string | null,
  }));

  // A risk's sourceLabel names the focus area of the assessment that
  // surfaced it, found via its sourceItem's own assessment — a second pass
  // because that lookup needs the checklist item, not just the risk row.
  if (risks.some((r) => r.sourceItemId)) {
    const sourceItems = await prisma.governanceChecklistItem.findMany({
      where: { id: { in: risks.map((r) => r.sourceItemId).filter((id): id is string => id !== null) } },
      select: { id: true, assessmentId: true },
    });
    const assessmentIdByItemId = new Map(sourceItems.map((i) => [i.id, i.assessmentId]));
    risks.forEach((r, i) => {
      if (!r.sourceItemId) return;
      const assessmentId = assessmentIdByItemId.get(r.sourceItemId);
      const focusArea = assessmentId ? focusAreaByAssessmentId.get(assessmentId) : undefined;
      if (focusArea) risksForPanel[i]!.sourceLabel = GOVERNANCE_FOCUS_AREA_LABEL[focusArea];
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
        subtitle="An AI-assisted assessment covers board structure, risk & controls, ethics, compensation and ESG. Key Control Points and KPIs below continue to come from each process's Authority Matrix."
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
          assessmentsByFocusArea={assessmentsByFocusArea}
          risks={risksForPanel}
          allPolicies={allPolicies}
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
