"use client";

import Link from "next/link";
import { OrgChartCanvas } from "../../(app)/workspaces/[workspaceId]/org/chart/org-chart-canvas";
import { StaticProcessMapDiagram } from "../../(app)/workspaces/[workspaceId]/processes/[processId]/map/static-process-map-diagram";
import type { RaciCode, StepType } from "@/lib/domain/raci-table";

type PersonT = { id: string; name: string; managerId: string | null; roleNames: string[] };

const DEFAULT_ACCENT_SECONDARY = "#4338ca";

export type ExportProcessData = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  processPurpose: string | null;
  inScope: string[];
  outOfScope: string[];
  externalEntities: { name: string; description: string }[];
  kpis: { metric: string; target: string; frequency: string }[];
  steps: {
    id: string;
    type: "START" | "TASK" | "DECISION" | "END";
    label: string;
    positionX: number;
    positionY: number;
    detailedAction: string[];
    exceptionHandling: string | null;
    assignedRole: { id: string; name: string } | null;
    swimlaneRole: { id: string; name: string } | null;
    links: { id: string; targetProcessId: string; targetProcess: { code: string; name: string } }[];
  }[];
  connections: { id: string; fromStepId: string; toStepId: string; label: string | null }[];
  matrixRoles: { id: string; name: string }[];
  combinedRows: {
    rowId: string;
    label: string;
    stepType: StepType | null;
    raci: Record<string, RaciCode>;
    approverLabel: string | null;
    slaDays: number | null;
    threshold: number | null;
    directionLabel: string;
    requiresApproval: boolean;
    coApprovalAboveThreshold: number | null;
    coApproverLabel: string | null;
    escalationLabel: string | null;
  }[];
  involvedRoles: { id: string; name: string; involvement: string }[];
  controlPoints: { rowId: string; statement: string; flagged: boolean }[];
  processOwnerName: string | null;
  triggerLabel: string | null;
  outputLabel: string | null;
  gaps: string[];
};

const CODE_LETTER: Record<RaciCode, string> = {
  RESPONSIBLE: "R",
  ACCOUNTABLE: "A",
  CONSULTED: "C",
  INFORMED: "I",
};

export function ExportPreview({
  workspaceId,
  companyName,
  industry,
  description,
  accentSecondary,
  people,
  processes,
}: {
  workspaceId: string;
  companyName: string;
  industry: string | null;
  description: string | null;
  accentSecondary: string | null;
  people: PersonT[];
  processes: ExportProcessData[];
}) {
  const allGaps = processes.flatMap((p) => p.gaps.map((gap) => ({ process: p.name, gap })));

  return (
    <div
      className="min-h-screen bg-white"
      style={{ "--accent-secondary": accentSecondary ?? DEFAULT_ACCENT_SECONDARY } as React.CSSProperties}
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-page { break-after: page; }
          .print-page:last-child { break-after: auto; }
          body { background: #fff !important; }
        }
        @page { size: A4 landscape; margin: 14mm; }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <Link
          href={`/workspaces/${workspaceId}/export`}
          className="text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          ← Back to picker
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Print / Save as PDF
        </button>
      </div>

      {allGaps.length > 0 && (
        <div className="no-print mx-auto mt-4 w-full max-w-5xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-sm font-semibold text-amber-900">
            ⚠ Some sections are missing content and are left out of this report
          </div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-amber-900">
            {allGaps.map(({ process, gap }, i) => (
              <li key={i}>
                <strong>{process}:</strong> {gap}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-amber-800">
            Fill these in on each process&rsquo;s Process Map page, then reload this report.
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <section className="print-page min-h-[70vh]">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-secondary)]">
            Company Report
          </div>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{companyName}</h1>
          {industry && <p className="mt-2 text-sm font-semibold text-slate-500">{industry}</p>}
          {description && (
            <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-700">{description}</p>
          )}
          <p className="mt-8 text-xs text-slate-500">
            Generated on {new Date().toLocaleDateString()} · Covers {processes.length} process
            {processes.length === 1 ? "" : "es"}
          </p>
        </section>

        {people.length > 0 && (
          <section className="print-page">
            <h2 className="text-xl font-semibold text-slate-900">Org Structure</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">Reporting lines across {companyName}.</p>
            <OrgChartCanvas people={people} />
          </section>
        )}

        {processes.map((process) => (
          <ProcessReportSection key={process.id} workspaceId={workspaceId} process={process} />
        ))}
      </main>
    </div>
  );
}

function SectionHeading({ num, title }: { num: string; title: string }) {
  return (
    <h3 className="mt-8 mb-2 flex items-baseline gap-2 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">
      <span className="text-[var(--accent-secondary)]">{num}</span> {title}
    </h3>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mt-4 mb-1.5 text-sm font-bold text-slate-800">{children}</h4>;
}

function ProcessReportSection({ workspaceId, process }: { workspaceId: string; process: ExportProcessData }) {
  const matrixRoleNameById = new Map(process.matrixRoles.map((r) => [r.id, r.name]));

  function stepOwnerLabel(row: ExportProcessData["combinedRows"][number]): string {
    const accountableRoleId = Object.entries(row.raci).find(([, code]) => code === "ACCOUNTABLE")?.[0];
    if (accountableRoleId) return matrixRoleNameById.get(accountableRoleId) ?? "—";
    return row.approverLabel ?? "—";
  }

  // Only steps that actually carry documentation appear as narrative cards —
  // an undocumented step is surfaced in the preview-only gaps banner instead
  // of printing as an empty box.
  const documentedSteps = process.steps.filter(
    (s) => s.detailedAction.length > 0 || s.exceptionHandling?.trim()
  );
  const hasScope = process.inScope.length > 0 || process.outOfScope.length > 0;

  return (
    <section className="print-page">
      <div className="border-b-2 border-slate-300 pb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-secondary)]">
          Business Process Documentation &amp; Procedure Standard
        </div>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">{process.name}</h2>
        {process.description && <p className="mt-1 text-sm text-slate-500">{process.description}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs sm:grid-cols-3">
          <MetaField label="Document ID" value={`${process.code}-${new Date().getFullYear()}`} />
          <MetaField label="Version" value="1.0" />
          <MetaField label="Effective Date" value={new Date().toISOString().slice(0, 10)} />
          <MetaField label="Review Cycle" value="Annual" />
          <MetaField label="Process Owner" value={process.processOwnerName ?? "—"} />
          <MetaField label="Process Code" value={process.code} mono />
        </dl>
      </div>

      {(process.processPurpose || process.triggerLabel || process.outputLabel) && (
        <>
          <SectionHeading num="1.0" title="Executive Summary" />
          {process.processPurpose && (
            <>
              <SubHeading>Process Purpose</SubHeading>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{process.processPurpose}</p>
            </>
          )}
          {(process.triggerLabel || process.outputLabel) && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              {process.triggerLabel && <ScopeBox label="Process Trigger" value={process.triggerLabel} />}
              {process.outputLabel && <ScopeBox label="Process Output" value={process.outputLabel} />}
            </div>
          )}
        </>
      )}

      {(process.involvedRoles.length > 0 || process.externalEntities.length > 0) && (
        <>
          <SectionHeading num="2.0" title="Involved Parties & Ecosystem" />
          {process.involvedRoles.length > 0 && (
            <>
              <SubHeading>Internal Roles</SubHeading>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {process.involvedRoles.map((r) => (
                  <li key={r.id}>
                    <strong className="text-slate-900">{r.name}</strong> — {r.involvement}
                  </li>
                ))}
              </ul>
            </>
          )}
          {process.externalEntities.length > 0 && (
            <>
              <SubHeading>External Entities</SubHeading>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {process.externalEntities.map((entity, i) => (
                  <li key={i}>
                    <strong className="text-slate-900">{entity.name}</strong> — {entity.description}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {process.combinedRows.length > 0 && (
        <>
          <SectionHeading num="3.0" title="RACI & Authority Matrix" />
          <p className="text-sm text-slate-500">
            Each task&rsquo;s responsibility assignment and its approval limits, combined into one table.
          </p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Process Step</th>
                  {process.matrixRoles.map((r) => (
                    <th key={r.id} className="px-3 py-2 text-center">
                      {r.name}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center">SLA</th>
                  <th className="px-3 py-2 text-center">Amount</th>
                  <th className="px-3 py-2 text-center">Direction</th>
                  <th className="px-3 py-2 text-center">Approval</th>
                  <th className="px-3 py-2 text-center">Co-approval</th>
                  <th className="px-3 py-2 text-center">Escalation</th>
                </tr>
              </thead>
              <tbody>
                {process.combinedRows.map((row) => (
                  <tr key={row.rowId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                    {process.matrixRoles.map((r) => {
                      const code = row.raci[r.id] as RaciCode | undefined;
                      return (
                        <td key={r.id} className="px-3 py-2 text-center font-mono text-xs font-bold text-slate-600">
                          {code ? CODE_LETTER[code] : ""}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-mono text-xs text-slate-600">
                      {row.slaDays === null ? "—" : `${row.slaDays} day${row.slaDays === 1 ? "" : "s"}`}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs text-slate-600">
                      {row.threshold === null ? "—" : `$${row.threshold.toLocaleString()}`}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-slate-600">{row.directionLabel}</td>
                    <td className="px-3 py-2 text-center text-xs text-slate-600">{row.approverLabel ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-xs text-slate-600">
                      {row.coApprovalAboveThreshold === null ? (
                        "—"
                      ) : (
                        <span className="flex flex-col leading-tight">
                          <span>{row.coApproverLabel ?? "not set"}</span>
                          <span className="font-mono text-[10px] text-slate-500">
                            above ${row.coApprovalAboveThreshold.toLocaleString()}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-slate-600">{row.escalationLabel ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasScope && (
        <>
          <SectionHeading num="4.0" title="Scope" />
          <div className="grid grid-cols-2 gap-4">
            {process.inScope.length > 0 && <BulletBox label="In-Scope" items={process.inScope} />}
            {process.outOfScope.length > 0 && <BulletBox label="Out-of-Scope" items={process.outOfScope} />}
          </div>
        </>
      )}

      {process.steps.length > 0 && (
        <>
          <SectionHeading num="5.0" title="Process Workflow & Narrative" />
          <StaticProcessMapDiagram workspaceId={workspaceId} steps={process.steps} connections={process.connections} />
          {documentedSteps.map((step) => {
            const row = process.combinedRows.find((r) => r.rowId === step.id);
            return (
              <div key={step.id} className="mt-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-slate-900">{step.label}</span>
                  <span className="text-xs text-slate-500">
                    Step Owner: {row ? stepOwnerLabel(row) : (step.assignedRole?.name ?? "—")}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  {step.detailedAction.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Detailed Action
                      </div>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-sm text-slate-700">
                        {step.detailedAction.map((action, i) => (
                          <li key={i}>{action}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {step.exceptionHandling && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Exception Handling
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{step.exceptionHandling}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {(process.controlPoints.length > 0 || process.kpis.length > 0) && (
        <>
          <SectionHeading num="6.0" title="Governance, Controls & Metrics" />
          {process.controlPoints.length > 0 && (
            <>
              <SubHeading>Key Control Points</SubHeading>
              <ul className="space-y-1.5 text-sm">
                {process.controlPoints.map((cp) => (
                  <li
                    key={cp.rowId}
                    className={cp.flagged ? "rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-800" : "text-slate-700"}
                  >
                    {cp.flagged && <strong>⚠ </strong>}
                    {cp.statement}
                  </li>
                ))}
              </ul>
            </>
          )}
          {process.kpis.length > 0 && (
            <>
              <SubHeading>Operational KPIs &amp; SLAs</SubHeading>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Metric</th>
                      <th className="px-3 py-2">Target</th>
                      <th className="px-3 py-2">Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {process.kpis.map((kpi, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{kpi.metric}</td>
                        <td className="px-3 py-2 text-slate-800">{kpi.target}</td>
                        <td className="px-3 py-2 text-slate-800">{kpi.frequency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function ScopeBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-800">{value}</div>
    </div>
  );
}

function BulletBox({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-slate-700">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
