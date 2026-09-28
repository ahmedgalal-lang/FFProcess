/**
 * The workspace-wide "Governance & Risk" section of the exported report
 * (spec 020): the Risk Register, a Policy Library index, and each aspect's
 * assessment summary. Pure — raw rows in, the view model both renderers
 * (the printed report and the PPTX deck) consume out — so the two formats
 * can't disagree about what's in it or in what order.
 */

import type {
  GovernancePolicyLifecycleStatus,
  RiskImpact,
  RiskLikelihood,
  RiskStatus,
} from "@/app/generated/prisma/client";
import { deriveRiskLevel, type RiskLevel } from "@/lib/domain/governance-risk";

export type GovernanceReportInput = {
  /** In the order the Governance page shows its tabs. */
  aspects: { id: string; name: string }[];
  assessments: { aspectId: string; summary: string }[];
  risks: {
    title: string;
    description: string;
    likelihood: RiskLikelihood;
    impact: RiskImpact;
    status: RiskStatus;
    ownerRoleId: string | null;
    ownerPersonId: string | null;
  }[];
  policies: { title: string; lifecycleStatus: GovernancePolicyLifecycleStatus; effectiveDate: Date | null }[];
  roleNameById: ReadonlyMap<string, string>;
  personNameById: ReadonlyMap<string, string>;
};

export type GovernanceReportRisk = {
  title: string;
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  level: RiskLevel;
  status: RiskStatus;
  owner: string | null;
};

export type GovernanceReport = {
  summaries: { aspectName: string; summary: string }[];
  risks: GovernanceReportRisk[];
  /** An index only — a policy's body is deliberately not carried (FR-009). */
  policies: { title: string; lifecycleStatus: GovernancePolicyLifecycleStatus; effectiveDate: Date | null }[];
};

const LEVEL_RANK: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function buildGovernanceReport(input: GovernanceReportInput): GovernanceReport {
  const summaryByAspect = new Map(input.assessments.map((a) => [a.aspectId, a.summary]));
  const summaries = input.aspects.flatMap((aspect) => {
    const summary = summaryByAspect.get(aspect.id)?.trim();
    // A hand-added checklist item creates an assessment shell with an empty
    // summary; that aspect has nothing to say here yet.
    return summary ? [{ aspectName: aspect.name, summary }] : [];
  });

  const risks = input.risks
    .map((r) => ({
      title: r.title,
      description: r.description,
      likelihood: r.likelihood,
      impact: r.impact,
      level: deriveRiskLevel(r.likelihood, r.impact),
      status: r.status,
      owner: r.ownerRoleId
        ? (input.roleNameById.get(r.ownerRoleId) ?? null)
        : r.ownerPersonId
          ? (input.personNameById.get(r.ownerPersonId) ?? null)
          : null,
    }))
    .sort((a, b) => {
      const closed = Number(a.status === "CLOSED") - Number(b.status === "CLOSED");
      if (closed !== 0) return closed;
      const level = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
      if (level !== 0) return level;
      return a.title.localeCompare(b.title);
    });

  const policies = input.policies
    .map((p) => ({ title: p.title, lifecycleStatus: p.lifecycleStatus, effectiveDate: p.effectiveDate }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return { summaries, risks, policies };
}

export function isGovernanceReportEmpty(report: GovernanceReport): boolean {
  return report.summaries.length === 0 && report.risks.length === 0 && report.policies.length === 0;
}

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  OPEN: "Open",
  MITIGATING: "Mitigating",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
};

export const POLICY_LIFECYCLE_LABEL: Record<GovernancePolicyLifecycleStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  RETIRED: "Retired",
};

/**
 * "1 Jun 2026". Fixed locale and zone: the printed report renders on the
 * server and again in the browser, and the two must agree.
 */
export function formatReportDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Low" from "LOW" — the scales the Risk Register already uses, read aloud. */
export function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
