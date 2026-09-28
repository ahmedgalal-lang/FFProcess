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
import { isTreatmentActionOverdue } from "@/lib/domain/risk-treatment";
import { breachNotificationState, daysOpen, describeBreachState, isIncidentActionOverdue, sortIncidents } from "@/lib/domain/incidents";
import { GovernanceIncidents, type IncidentT } from "./governance-incidents";
import { GovernancePrivacy, type BreachT, type ProcessingActivityT } from "./governance-privacy";
import { isDpiaRecommended, needsPriorConsultation } from "@/lib/domain/privacy";
import { GovernanceConflicts, type ConflictT } from "./governance-conflicts";
import { GovernanceTraining, type TrainingCourseT } from "./governance-training";
import { trainingExpiry, trainingState } from "@/lib/domain/training";
import { GovernanceVendors, type VendorT } from "./governance-vendors";
import { GovernanceEthics, type EthicsCaseT } from "./governance-ethics";
import { formatCaseReference } from "@/lib/domain/ethics";
import { GovernanceDashboard } from "./governance-dashboard";
import { GovernanceActivityLog } from "./governance-activity-log";
import { loadGovernanceActivity } from "@/lib/data/governance-activity";
import { buildDashboardTiles, isDashboardEmpty } from "@/lib/domain/governance-dashboard";
import { deriveRiskLevel } from "@/lib/domain/governance-risk";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { hasSufficientAccess } from "@/lib/domain/access-control";
import { contractState, isDueDiligenceOverdue, nextDueDiligenceOn, sortVendors } from "@/lib/domain/vendors";

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
  // A dashboard risk tile links here with ?riskLevel=, which shows every open
  // risk at that level across all aspects (spec 026).
  const rawLevel = (await props.searchParams)["riskLevel"];
  const riskLevel = rawLevel === "HIGH" || rawLevel === "MEDIUM" || rawLevel === "LOW" ? rawLevel : null;
  // Ethics cases (spec 022) are Admin-only: for anyone else they're never
  // queried, so nothing about them — not even a count — reaches the browser.
  const access = await requireWorkspaceAccess(workspaceId);
  const isAdmin = access.ok && hasSufficientAccess(access.data.accessLevel, "ADMIN");

  const [
    workspace,
    roles,
    people,
    processes,
    aspects,
    assessments,
    risks,
    policies,
    incidents,
    allProcesses,
    activities,
    conflicts,
    courses,
    vendors,
    ethicsCases,
    activity,
  ] =
    await Promise.all([
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
    prisma.governanceRisk.findMany({
      where: { workspaceId },
      include: { treatmentActions: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
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
    // The incident log (spec 024), workspace-wide.
    prisma.governanceIncident.findMany({
      where: { workspaceId },
      include: {
        actions: { orderBy: { createdAt: "asc" } },
        riskLinks: { include: { risk: { select: { id: true, title: true } } } },
      },
    }),
    // Archived ones too: an incident keeps a link to a process archived after it was logged.
    prisma.process.findMany({ where: { workspaceId }, select: { id: true, name: true, archivedAt: true }, orderBy: { code: "asc" } }),
    // The data privacy register (spec 025).
    prisma.processingActivity.findMany({
      where: { workspaceId },
      include: {
        dpias: { include: { approvedByUser: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } },
        breachLinks: true,
      },
      orderBy: { name: "asc" },
    }),
    // Conflicts of interest and training records (spec 021).
    prisma.conflictOfInterest.findMany({ where: { workspaceId }, orderBy: { declaredOn: "desc" } }),
    prisma.trainingCourse.findMany({
      where: { workspaceId },
      include: { completions: { orderBy: { completedOn: "desc" } } },
      orderBy: { name: "asc" },
    }),
    // The vendor register (spec 023).
    prisma.vendor.findMany({
      where: { workspaceId },
      include: { riskLinks: { include: { risk: { select: { id: true, title: true } } } } },
    }),
    isAdmin
      ? prisma.ethicsCase.findMany({
          where: { workspaceId },
          include: { notes: { include: { author: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } } },
          orderBy: { number: "desc" },
        })
      : Promise.resolve([]),
    // The governance activity feed's first page (spec 019).
    loadGovernanceActivity(workspaceId),
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
    treatmentStrategy: r.treatmentStrategy,
    treatmentRationale: r.treatmentRationale,
    targetLikelihood: r.targetLikelihood,
    targetImpact: r.targetImpact,
    treatmentActions: r.treatmentActions.map((a) => ({
      id: a.id,
      description: a.description,
      ownerLabel: a.ownerRoleId
        ? ownerLabel(roleById.get(a.ownerRoleId))
        : a.ownerPersonId
          ? ownerLabel(personById.get(a.ownerPersonId))
          : null,
      dueDate: a.dueDate ? dayOf(a.dueDate) : null,
      done: a.doneAt !== null,
      overdue: isTreatmentActionOverdue(a.dueDate, a.doneAt, now),
    })),
    incidentTitles: incidents.filter((i) => i.riskLinks.some((l) => l.riskId === r.id)).map((i) => i.title),
    vendorNames: vendors.filter((v) => v.riskLinks.some((l) => l.riskId === r.id)).map((v) => v.name),
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

  const processById = new Map(allProcesses.map((p) => [p.id, p]));
  const incidentsForSection: IncidentT[] = sortIncidents(incidents).map((i) => {
    const breach = breachNotificationState(i, now);
    return {
      id: i.id,
      title: i.title,
      description: i.description,
      occurredAt: dayOf(i.occurredAt),
      severity: i.severity,
      category: i.category,
      status: i.status,
      rootCause: i.rootCause,
      processId: i.processId,
      processLabel: i.processId ? ownerLabel(processById.get(i.processId)) : null,
      daysOpen: daysOpen(i.occurredAt, i.closedAt, now),
      personalDataBreach: i.personalDataBreach,
      breachAwareAt: i.breachAwareAt?.toISOString() ?? null,
      regulatorNotifiedAt: i.regulatorNotifiedAt?.toISOString() ?? null,
      notificationNotRequiredReason: i.notificationNotRequiredReason,
      breach: { ...breach, deadline: breach.deadline?.toISOString() ?? null },
      actions: i.actions.map((a) => ({
        id: a.id,
        description: a.description,
        ownerLabel: a.ownerRoleId
          ? ownerLabel(roleById.get(a.ownerRoleId))
          : a.ownerPersonId
            ? ownerLabel(personById.get(a.ownerPersonId))
            : null,
        dueDate: a.dueDate ? dayOf(a.dueDate) : null,
        done: a.doneAt !== null,
        overdue: isIncidentActionOverdue(a.dueDate, a.doneAt, now),
      })),
      risks: i.riskLinks.map((l) => l.risk),
    };
  });

  const activitiesForSection: ProcessingActivityT[] = activities.map((a) => ({
    id: a.id,
    name: a.name,
    purpose: a.purpose,
    lawfulBasis: a.lawfulBasis,
    dataSubjectCategories: a.dataSubjectCategories,
    personalDataCategories: a.personalDataCategories,
    recipients: a.recipients,
    retentionPeriod: a.retentionPeriod,
    specialCategory: a.specialCategory,
    transferDestination: a.transferDestination,
    transferSafeguard: a.transferSafeguard,
    processId: a.processId,
    processLabel: a.processId ? ownerLabel(processById.get(a.processId)) : null,
    ownerRoleId: a.ownerRoleId,
    ownerPersonId: a.ownerPersonId,
    ownerLabel: a.ownerRoleId
      ? ownerLabel(roleById.get(a.ownerRoleId))
      : a.ownerPersonId
        ? ownerLabel(personById.get(a.ownerPersonId))
        : null,
    dpiaRecommended: isDpiaRecommended(a),
    dpias: a.dpias.map((d) => ({
      id: d.id,
      risksIdentified: d.risksIdentified,
      mitigations: d.mitigations,
      residualRisk: d.residualRisk,
      status: d.status,
      approvedByName: d.approvedByUser ? (d.approvedByUser.name ?? d.approvedByUser.email) : null,
      approvedAt: d.approvedAt ? formatDate(d.approvedAt) : null,
      priorConsultation: needsPriorConsultation(d),
    })),
  }));
  // Breaches are incidents flagged in the log (spec 024), never a second record.
  const breachesForSection: BreachT[] = incidentsForSection
    .filter((i) => i.personalDataBreach)
    .map((i) => {
      const described = describeBreachState(i.breach)!;
      return {
        id: i.id,
        title: i.title,
        notificationLabel: described.text,
        urgent: described.urgent,
        activityIds: activities.filter((a) => a.breachLinks.some((l) => l.incidentId === i.id)).map((a) => a.id),
      };
    });

  const personLabel = (id: string) => ownerLabel(personById.get(id)) ?? "Unknown person";
  const conflictsForSection: ConflictT[] = conflicts.map((c) => ({
    id: c.id,
    personId: c.personId,
    personLabel: personLabel(c.personId),
    description: c.description,
    relatedParty: c.relatedParty,
    declaredOn: dayOf(c.declaredOn),
    status: c.status,
    mitigationNote: c.mitigationNote,
  }));
  const coursesForSection: TrainingCourseT[] = courses.map((course) => ({
    id: course.id,
    name: course.name,
    validityMonths: course.validityMonths,
    completions: course.completions.map((c) => {
      const expiry = trainingExpiry(c.completedOn, course.validityMonths);
      return {
        id: c.id,
        personLabel: personLabel(c.personId),
        completedOn: dayOf(c.completedOn),
        expiresOn: expiry ? dayOf(expiry) : null,
        state: trainingState(c.completedOn, course.validityMonths, now),
      };
    }),
  }));

  const vendorsForSection: VendorT[] = sortVendors(vendors).map((v) => {
    const next = nextDueDiligenceOn(v.lastDueDiligenceOn, v.reviewCycleMonths);
    return {
      id: v.id,
      name: v.name,
      service: v.service,
      criticality: v.criticality,
      ownerRoleId: v.ownerRoleId,
      ownerPersonId: v.ownerPersonId,
      ownerLabel: v.ownerRoleId
        ? ownerLabel(roleById.get(v.ownerRoleId))
        : v.ownerPersonId
          ? ownerLabel(personById.get(v.ownerPersonId))
          : null,
      dueDiligenceStatus: v.dueDiligenceStatus,
      lastDueDiligenceOn: v.lastDueDiligenceOn ? dayOf(v.lastDueDiligenceOn) : null,
      reviewCycleMonths: v.reviewCycleMonths,
      nextDueDiligenceOn: next ? dayOf(next) : null,
      dueDiligenceOverdue: isDueDiligenceOverdue(v.lastDueDiligenceOn, v.reviewCycleMonths, now),
      contractStartOn: v.contractStartOn ? dayOf(v.contractStartOn) : null,
      contractEndOn: v.contractEndOn ? dayOf(v.contractEndOn) : null,
      contractState: contractState(v.contractEndOn, now),
      risks: v.riskLinks.map((l) => l.risk),
    };
  });

  const casesForSection: EthicsCaseT[] = ethicsCases.map((c) => ({
    id: c.id,
    reference: formatCaseReference(c.number),
    receivedOn: dayOf(c.receivedOn),
    channel: c.channel,
    category: c.category,
    severity: c.severity,
    description: c.description,
    anonymous: c.anonymous,
    reporterName: c.reporterName,
    status: c.status,
    investigatorPersonId: c.investigatorPersonId,
    investigatorName: c.investigatorName,
    outcome: c.outcome,
    closingSummary: c.closingSummary,
    daysOpen: daysOpen(c.receivedOn, c.closedAt, now),
    notes: c.notes.map((n) => ({
      id: n.id,
      body: n.body,
      authorName: n.author.name ?? n.author.email,
      createdAt: formatDate(n.createdAt),
    })),
  }));

  const checklistItems = Object.values(assessmentsByAspectId).flatMap((a) => a?.items ?? []);
  const dashboardInput = {
    risks: risksForPanel.map((r) => ({ level: deriveRiskLevel(r.likelihood, r.impact), closed: r.status === "CLOSED" })),
    policies: allPolicies.map((p) => ({ needsReview: p.needsReview })),
    checklist: {
      done: checklistItems.filter((i) => i.status === "DONE").length,
      total: checklistItems.filter((i) => i.status !== "DISMISSED").length,
      overdue: checklistItems.filter((i) => i.overdue).length,
    },
    treatment: { overdueActions: risksForPanel.reduce((n, r) => n + r.treatmentActions.filter((a) => a.overdue).length, 0) },
    incidents: incidentsForSection.map((i) => ({
      severity: i.severity,
      closed: i.status === "CLOSED",
      overdueActions: i.actions.filter((a) => a.overdue).length,
      breachOverdue: i.breach.state === "OVERDUE",
    })),
    vendors: vendorsForSection.map((v) => ({
      dueDiligenceOverdue: v.dueDiligenceOverdue,
      renewalSoon: v.contractState === "RENEWAL_SOON",
      contractExpired: v.contractState === "EXPIRED",
    })),
    conflicts: conflictsForSection.map((c) => ({ closed: c.status === "CLOSED" })),
    training: {
      expired: coursesForSection.reduce((n, c) => n + c.completions.filter((x) => x.state === "EXPIRED").length, 0),
      expiringSoon: coursesForSection.reduce((n, c) => n + c.completions.filter((x) => x.state === "EXPIRING_SOON").length, 0),
      completions: coursesForSection.reduce((n, c) => n + c.completions.length, 0),
    },
    privacy: activitiesForSection.map((a) => ({ dpiaRecommended: a.dpiaRecommended })),
    // Only Admins ever get this field, so only they get an ethics tile (spec 022).
    ...(isAdmin ? { ethics: casesForSection.map((c) => ({ closed: c.status === "CLOSED" })) } : {}),
  };

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
        <GovernanceDashboard
          basePath={`/workspaces/${workspaceId}/governance`}
          tiles={buildDashboardTiles(dashboardInput)}
          empty={isDashboardEmpty(dashboardInput)}
        />
      </div>

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
          riskLevel={riskLevel}
          allPolicies={allPolicies}
          people={people.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
          roles={roles.map((r) => ({ id: r.id, name: r.name, archived: r.archivedAt !== null }))}
        />
      </div>

      <div className="mb-6">
        <GovernanceIncidents
          workspaceId={workspaceId}
          incidents={incidentsForSection}
          processes={allProcesses.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
          risks={risks.map((r) => ({ id: r.id, title: r.title }))}
          people={people.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
          roles={roles.map((r) => ({ id: r.id, name: r.name, archived: r.archivedAt !== null }))}
        />
      </div>

      <div className="mb-6">
        <GovernancePrivacy
          workspaceId={workspaceId}
          activities={activitiesForSection}
          breaches={breachesForSection}
          processes={allProcesses.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
          people={people.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
          roles={roles.map((r) => ({ id: r.id, name: r.name, archived: r.archivedAt !== null }))}
        />
      </div>

      <div className="mb-6">
        <GovernanceVendors
          workspaceId={workspaceId}
          vendors={vendorsForSection}
          risks={risks.map((r) => ({ id: r.id, title: r.title }))}
          people={people.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
          roles={roles.map((r) => ({ id: r.id, name: r.name, archived: r.archivedAt !== null }))}
        />
      </div>

      <div className="mb-6">
        <GovernanceConflicts
          workspaceId={workspaceId}
          conflicts={conflictsForSection}
          people={people.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
        />
      </div>

      <div className="mb-6">
        <GovernanceTraining
          workspaceId={workspaceId}
          courses={coursesForSection}
          people={people.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
        />
      </div>

      {isAdmin && (
        <div className="mb-6">
          <GovernanceEthics
            workspaceId={workspaceId}
            cases={casesForSection}
            people={people.map((p) => ({ id: p.id, name: p.name, archived: p.archivedAt !== null }))}
          />
        </div>
      )}

      <div className="mb-6">
        <GovernanceActivityLog workspaceId={workspaceId} initialEntries={activity.entries} initialCursor={activity.nextCursor} />
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
