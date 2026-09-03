"use client";

import Link from "next/link";
import { StaticOrgChart } from "../../(app)/workspaces/[workspaceId]/org/chart/static-org-chart";
import { StaticProcessMapDiagram } from "../../(app)/workspaces/[workspaceId]/processes/[processId]/map/static-process-map-diagram";
import { StaticMilestoneRails } from "../../(app)/workspaces/[workspaceId]/helicopter/static-milestone-rails";
import { mixHex, readableInkOn } from "@/lib/domain/color-contrast";
import type { RaciCode, StepType } from "@/lib/domain/raci-table";
import type { RailProcess } from "@/lib/domain/milestone-rails";

type PersonT = { id: string; name: string; managerId: string | null; roleNames: string[] };

const DEFAULT_ACCENT_SECONDARY = "#4338ca";
// Same defaults, same functions, as the workspace layout that paints the
// sidebar pages — a client's report banner and its app banner come out
// identical rather than two independent guesses at "the brand colour".
const DEFAULT_ACCENT = "#334155"; // slate-700 — a workspace with no logo/accent set yet
const DEFAULT_ACCENT_TERTIARY = "#4338ca";

export type ExportProcessData = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** The main process this one is filed under, for the title banner's breadcrumb. */
  parentCode: string | null;
  parentName: string | null;
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
  involvedRoles: {
    id: string;
    name: string;
    duties: { key: string; label: string; tasks: string[] }[];
  }[];
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

/** One phase's worth of the value chain, as the report prints it. */
export type ValueChainColumn = {
  title: string;
  color: string | null;
  activities: {
    stepId: string;
    label: string;
    ownerName: string | null;
    supportNames: string[];
    processCode: string;
    linksTo: string[];
  }[];
};

export function ExportPreview({
  workspaceId,
  companyName,
  industry,
  description,
  accentColor,
  accentColorTertiary,
  accentSecondary,
  people,
  processes,
  valueChain,
  unphasedActivityCount,
  railProcesses,
}: {
  workspaceId: string;
  companyName: string;
  industry: string | null;
  description: string | null;
  accentColor: string | null;
  accentColorTertiary: string | null;
  accentSecondary: string | null;
  people: PersonT[];
  processes: ExportProcessData[];
  valueChain: ValueChainColumn[];
  unphasedActivityCount: number;
  railProcesses: RailProcess[];
}) {
  const allGaps = processes.flatMap((p) => p.gaps.map((gap) => ({ process: p.name, gap })));
  const pptxHref = `/api/export/report/${workspaceId}?${processes.map((p) => `ids=${p.id}`).join("&")}`;

  // The four main-title banners (cover, value chain, each process title) paint
  // themselves in this — the workspace's own Primary accent, resolved exactly
  // the way the app layout resolves it, so the ink colour stays readable
  // whether the brand colour is navy or pale yellow.
  const accentPrimary = accentColor ?? DEFAULT_ACCENT;
  const accentTertiary = accentColorTertiary ?? DEFAULT_ACCENT_TERTIARY;

  return (
    <div
      className="report-root min-h-screen"
      style={
        {
          "--accent": accentPrimary,
          "--accent-secondary": accentSecondary ?? DEFAULT_ACCENT_SECONDARY,
          "--accent-tertiary": accentTertiary,
          "--accent-banner-to": mixHex(accentPrimary, accentTertiary, 0.3),
          "--accent-ink": readableInkOn(accentPrimary),
        } as React.CSSProperties
      }
    >
      <style>{`
        /* The preview is laid out on the real page: an A4 landscape sheet
           (297mm) with the printer's own 14mm margin as padding, leaving
           exactly the 269mm the PDF gets. Previewing at some other width is
           what let the two disagree — a responsive column that existed on
           screen and never on paper, text wrapping at a different point.
           At this width they can't. */
        @media screen {
          /* Grey behind the sheet, so the page reads as a page. Set on the
             report's own root as well as body — a white wrapper stretched to
             the viewport would otherwise paint straight over it. */
          body { background: #e9edf2 !important; }
          .report-root { background: #e9edf2; }
          /* The preview-only notices sit above the sheet and share its width,
             so nothing on screen is wider than the page it describes. */
          .report-notice { width: 297mm; max-width: 100%; margin: 16px auto 0; }
          .report-paper {
            width: 297mm;
            max-width: 100%;
            margin: 20px auto 64px;
            padding: 14mm;
            background: #fff;
            box-shadow: 0 2px 10px rgba(15, 23, 42, 0.14);
          }
          /* Where the PDF is forced onto a new page, the preview says so
             rather than leaving the reader to find out at print time. */
          .print-page:not(:last-child)::after {
            content: "Page break";
            display: block;
            margin: 22px -14mm 26px;
            padding-top: 6px;
            border-top: 1px dashed #94a3b8;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: #94a3b8;
            text-align: center;
          }
        }

        @media print {
          .no-print { display: none !important; }
          .print-page { break-after: page; }
          .print-page:last-child { break-after: auto; }
          body { background: #fff !important; }
          .report-root { background: #fff; }
          /* On paper the sheet *is* the page — the printer supplies the
             width and margin, so the preview's paper styling comes off. */
          .report-paper {
            width: auto;
            max-width: none;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }

          /* A heading is never left alone at the bottom of a page with its
             own content starting on the next one — push the whole heading
             over instead of breaking right after it. */
          h1, h2, h3, h4 { break-after: avoid; break-inside: avoid; }

          /* Table rows read as one thing and shouldn't be sliced by a page
             boundary — a row half on one page and half on the next is
             unreadable either side of the cut. */
          tr { break-inside: avoid; }

          /* Chrome's print engine doesn't fragment a flex container reliably
             — a list of break-inside-avoid cards inside a flex column can
             jump to the next page as one clump even when several of them
             would still fit on the page they're on, wasting whatever room
             was left. Block layout fragments the way break-inside-avoid on
             each child expects, so print falls back to it here and swaps
             the flex gap for margins between the same children. */
          .print-stack { display: block; }
          .print-stack > * + * { margin-top: 10px; }
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
        <a
          href={pptxHref}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Download PPTX
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Print / Save as PDF
        </button>
      </div>

      {unphasedActivityCount > 0 && (
        <div className="no-print report-notice rounded-xl border border-slate-300 bg-slate-50 px-4 py-3">
          <div className="text-sm font-semibold text-slate-800">
            {unphasedActivityCount} {unphasedActivityCount === 1 ? "activity is" : "activities are"} not in a phase
            yet
          </div>
          <p className="mt-1 text-xs text-slate-600">
            They are documented in the process sections as usual, but are left off the Value Chain page — put them
            in a phase on the Value Chain board to include them.
          </p>
        </div>
      )}

      {allGaps.length > 0 && (
        <div className="no-print report-notice rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
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

      <main className="report-paper">
        <section className="print-page">
          <BrandBanner>
            <h1 className="text-3xl font-bold">{companyName}</h1>
            {industry && <p className="mt-1 text-sm opacity-85">{industry}</p>}
          </BrandBanner>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--accent-secondary)]">
            Business Process Documentation &amp; Procedure Standard
          </div>
          {description && (
            <p className="mt-2 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-700">{description}</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Generated on {new Date().toLocaleDateString()} · Covers {processes.length} process
            {processes.length === 1 ? "" : "es"}
          </p>
        </section>

        {people.length > 0 && (
          <section className="print-page">
            <h2 className="text-xl font-semibold text-slate-900">Org Structure</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">Reporting lines across {companyName}.</p>
            <StaticOrgChart people={people} />
          </section>
        )}

        {railProcesses.length > 0 && (
          <HelicopterViewPage processes={railProcesses} companyName={companyName} />
        )}

        {valueChain.length > 0 && (
          <ValueChainPage columns={valueChain} companyName={companyName} />
        )}

        {processes.length > 0 && <ProcessIndexPage processes={processes} />}

        {processes.map((process) => (
          <ProcessReportSection key={process.id} workspaceId={workspaceId} process={process} />
        ))}

        <ClosingPage />
      </main>
    </div>
  );
}

/**
 * The main-title treatment: painted in the workspace's own Primary accent,
 * with an ink colour chosen for contrast against it rather than assumed white
 * — the same banner the sidebar pages use, so a report and the app it came
 * from read as one brand rather than two different guesses at it. Reserved
 * for the four titles that open a real section of the document: the cover,
 * the Value Chain page, and each process's own title.
 */
function BrandBanner({ eyebrow, children }: { eyebrow?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-6 py-5 text-[var(--accent-ink)]"
      style={{ backgroundImage: "linear-gradient(120deg, var(--accent), var(--accent-banner-to))" }}
    >
      {eyebrow && <div className="mb-1 flex items-center gap-2 text-xs opacity-80">{eyebrow}</div>}
      {children}
    </div>
  );
}

/**
 * The last page: a branded bar closing the document out, so a reader reaches
 * a deliberate end rather than the last process's tables simply stopping.
 * Centred and text-only — it carries no data, so nothing here can go stale.
 */
function ClosingPage() {
  return (
    <section className="print-page mt-10 break-inside-avoid">
      <div
        className="rounded-xl px-6 py-10 text-center text-[var(--accent-ink)]"
        style={{ backgroundImage: "linear-gradient(120deg, var(--accent), var(--accent-banner-to))" }}
      >
        <p className="text-xl font-bold">Thank you</p>
        <p className="mx-auto mt-2 max-w-xl text-sm opacity-90">
          Please refer back to the process team for any inputs or comments needed.
        </p>
      </div>
    </section>
  );
}

/** Splits a list into fixed-size groups, so a wide grid can be laid out as rows that page-break between each other. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function SectionHeading({ num, title }: { num: string; title: string }) {
  return (
    <h3 className="mt-8 mb-2 flex items-baseline gap-2 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">
      <span className="text-[var(--accent-secondary)]">{num}</span> {title}
    </h3>
  );
}

/** A numbered heading one size down from SectionHeading, for a section folded in as a closing subsection rather than a heading of its own. */
function MinorSectionHeading({ num, title }: { num: string; title: string }) {
  return (
    <h4 className="mt-6 mb-1.5 flex items-baseline gap-2 border-b border-slate-100 pb-1.5 text-sm font-bold text-slate-800">
      <span className="text-[var(--accent-secondary)]">{num}</span> {title}
    </h4>
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

  const hasExecutiveSummary =
    process.processPurpose ||
    process.triggerLabel ||
    process.outputLabel ||
    process.involvedRoles.length > 0 ||
    process.externalEntities.length > 0;
  const hasProcessMap = process.steps.length > 0 || hasScope;
  const hasRaciAuthority = process.combinedRows.length > 0 || process.controlPoints.length > 0 || process.kpis.length > 0;

  return (
    // Every process starts on its own fresh page, whether or not it has a
    // body — an umbrella program with nothing beyond its title card still
    // gets a page of its own rather than sharing one with the next process's
    // content: two processes' banners stacked on one page reads as one
    // process bleeding into another, not as two separate documents.
    <section className="print-page">
      {/* Banner and its document metadata are one title block — kept
          together so a page break can't land between them and strand the
          banner alone at the bottom of a page. */}
      <div className="break-inside-avoid">
        <BrandBanner
          eyebrow={
            <>
              <span className="rounded bg-black/15 px-1.5 py-0.5 font-mono text-[10px] font-bold">{process.code}</span>
              {process.parentName && (
                <span>
                  under {process.parentCode} · {process.parentName}
                </span>
              )}
            </>
          }
        >
          <h2 className="text-2xl font-bold">{process.name}</h2>
          {process.description && <p className="mt-1 text-sm opacity-85">{process.description}</p>}
        </BrandBanner>
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 border-b-2 border-slate-100 pb-3 text-xs sm:grid-cols-3">
          <MetaField label="Document ID" value={`${process.code}-${new Date().getFullYear()}`} />
          <MetaField label="Version" value="1.0" />
          <MetaField label="Effective Date" value={new Date().toISOString().slice(0, 10)} />
          <MetaField label="Review Cycle" value="Annual" />
          <MetaField label="Process Owner" value={process.processOwnerName ?? "—"} />
          <MetaField label="Process Code" value={process.code} mono />
        </dl>
      </div>

      {hasExecutiveSummary && (
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
          {process.involvedRoles.length > 0 && (
            <>
              <SubHeading>Internal Roles</SubHeading>
              <div className="print-stack flex flex-col gap-2.5">
                {process.involvedRoles.map((role) => (
                  <RoleCard key={role.id} name={role.name} duties={role.duties} />
                ))}
              </div>
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

      {hasProcessMap && (
        <>
          <SectionHeading num="2.0" title="Process Map & Narrative" />
          {hasScope && (
            <>
              <SubHeading>Scope</SubHeading>
              <div className="grid grid-cols-2 gap-4">
                {process.inScope.length > 0 && <BulletBox label="In-Scope" items={process.inScope} />}
                {process.outOfScope.length > 0 && <BulletBox label="Out-of-Scope" items={process.outOfScope} />}
              </div>
            </>
          )}
          {process.steps.length > 0 && (
            <>
              {hasScope && <SubHeading>Workflow</SubHeading>}
              <StaticProcessMapDiagram
                workspaceId={workspaceId}
                steps={process.steps}
                connections={process.connections}
              />
              {documentedSteps.map((step) => {
                const row = process.combinedRows.find((r) => r.rowId === step.id);
                return (
                  <div key={step.id} className="mt-3 break-inside-avoid rounded-xl border border-slate-200 p-4">
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
        </>
      )}

      {hasRaciAuthority && (
        <>
          <SectionHeading num="3.0" title="RACI & Authority Matrix" />
          {process.combinedRows.length > 0 && (
            <>
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
                            <td
                              key={r.id}
                              className="px-3 py-2 text-center font-mono text-xs font-bold text-slate-600"
                            >
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

          {(process.controlPoints.length > 0 || process.kpis.length > 0) && (
            <>
              <MinorSectionHeading num="3.1" title="Governance, Controls & Metrics" />
              {process.controlPoints.length > 0 && (
                <>
                  <SubHeading>Key Control Points</SubHeading>
                  <ul className="space-y-1.5 text-sm">
                    {process.controlPoints.map((cp) => (
                      <li
                        key={cp.rowId}
                        className={
                          cp.flagged ? "rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-800" : "text-slate-700"
                        }
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
        </>
      )}
    </section>
  );
}

/**
 * How the processes in this pack connect, before either the chain page or the
 * per-process detail: which one resumes from a step of another, and which
 * step hands off to another process — the same rails the workspace's own
 * Helicopter View draws, scoped to just what's in this pack so a rail never
 * points at a process the reader can't turn to.
 */
function HelicopterViewPage({ processes, companyName }: { processes: RailProcess[]; companyName: string }) {
  return (
    <section className="print-page">
      <TwoToneRule />
      <h2 className="text-xl font-semibold text-slate-900">Helicopter View</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        How {companyName}&rsquo;s processes in this report connect, at a glance.
      </p>
      <StaticMilestoneRails processes={processes} />
    </section>
  );
}

/**
 * The whole engagement in one page, before the process documents: each phase
 * and the activities in it, with who owns each. Names and owners only — the
 * detail is the process sections that follow, and repeating it here would make
 * the pack say everything twice.
 */
function ValueChainPage({ columns, companyName }: { columns: ValueChainColumn[]; companyName: string }) {
  const printed = columns.flatMap((column) => column.activities);
  const activityCount = printed.length;
  // Counted from what this page actually prints, so the three numbers in the
  // line below can't disagree with each other.
  const departmentCount = new Set(
    printed.flatMap((activity) => [...(activity.ownerName ? [activity.ownerName] : []), ...activity.supportNames])
  ).size;

  return (
    <section className="print-page">
      <BrandBanner
        eyebrow={<span>Business Process Documentation &amp; Procedure Standard</span>}
      >
        <h2 className="text-2xl font-bold">{companyName} Value Chain</h2>
        <p className="mt-1 text-sm opacity-85">
          {activityCount} {activityCount === 1 ? "activity" : "activities"} · {columns.length}{" "}
          {columns.length === 1 ? "phase" : "phases"} · {departmentCount}{" "}
          {departmentCount === 1 ? "department" : "departments"}
        </p>
      </BrandBanner>

      <SectionHeading num="0.1" title="The chain, end to end" />

      {/* One grid per row of four phases rather than a single grid holding
          them all. A CSS grid doesn't fragment across printed pages in
          Chrome — the whole thing jumps to the next page when it doesn't
          fit, which on a real chain left most of a page blank under this
          heading. A row is small enough to place, and rows break between
          each other. Nothing here is break-inside-avoid above the level of
          a single activity: a long phase may continue on the next page,
          but no entry is ever cut in half. */}
      {/* Three per row, fixed rather than responsive: an A4 landscape page is
          narrower than the lg breakpoint, so a responsive fourth column
          existed on screen and never in the PDF — and a row that wraps
          differently in print is exactly how a phase ended up stranded on a
          line of its own. */}
      {chunk(columns, 3).map((row, rowIndex) => (
        <div key={rowIndex} className="mb-5 grid grid-cols-3 gap-x-5 gap-y-5">
          {row.map((column) => (
            <div key={column.title}>
              <h3
                className="border-b-2 pb-1 text-[10px] font-bold uppercase tracking-wide"
                style={{ borderColor: column.color ?? "#cbd5e1", color: column.color ?? "#475569" }}
              >
                {column.title}
              </h3>
              <ul className="print-stack mt-2 flex flex-col gap-2">
                {column.activities.map((activity) => (
                  <li key={activity.stepId} className="break-inside-avoid text-xs leading-tight">
                    <span className="font-semibold text-slate-900">{activity.label}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      {activity.ownerName ?? "No owner yet"}
                      {activity.supportNames.length > 0 && ` · support ${activity.supportNames.join(", ")}`}
                      {activity.linksTo.length > 0 && ` → ${activity.linksTo.join(", ")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}

      <p className="mt-6 text-xs text-slate-500">
        Each activity is documented in full in the process sections that follow.
      </p>
    </section>
  );
}

// Cycled across the numbered badges below so the index page draws on all
// three of the workspace's brand colors rather than just the one accent the
// rest of the report leans on.
const INDEX_BADGE_COLORS = ["var(--accent)", "var(--accent-secondary)", "var(--accent-tertiary)"];

/**
 * A two-tone accent bar marking a section break on screen, not just on paper
 * — a "print-page" alone only forces a page break under @media print, so
 * without this a section boundary is invisible while previewing in the
 * browser. Shared by every top-level page that isn't already a full
 * BrandBanner, so they all mark their own start the same way.
 */
function TwoToneRule() {
  return (
    <div
      className="mb-6 h-[3px] rounded-full"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--accent) 0%, var(--accent) 60%, var(--accent-tertiary) 60%, var(--accent-tertiary) 100%)",
      }}
    />
  );
}

/**
 * Every process in the pack, by code and name, in the order they print — the
 * table of contents. Sits after the Value Chain page, before the first
 * process document, so a reader knows what's ahead before reaching it. The
 * two-tone rule above the heading is this page's own separator — the section
 * headings below it get a plain border-bottom, but nothing marked where the
 * Value Chain page ended and this one began.
 */
function ProcessIndexPage({ processes }: { processes: ExportProcessData[] }) {
  return (
    <section className="print-page">
      <TwoToneRule />
      <h2 className="text-xl font-semibold text-slate-900">Processes in This Report</h2>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        {processes.length} process{processes.length === 1 ? "" : "es"}, in the order they follow.
      </p>
      <ol className="flex flex-col">
        {processes.map((process, i) => (
          <li
            key={process.id}
            className="flex items-center gap-3 border-b border-slate-100 py-2.5 text-sm last:border-b-0"
          >
            <span
              className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: INDEX_BADGE_COLORS[i % INDEX_BADGE_COLORS.length] }}
            >
              {i + 1}
            </span>
            <span className="flex-none rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700">
              {process.code}
            </span>
            <span className="font-semibold text-slate-900">{process.name}</span>
            <span className="flex-1 border-b border-dotted border-slate-300" />
            <span className="flex-none text-xs text-slate-500">
              {process.parentName ? `under ${process.parentCode}` : "top-level"}
            </span>
          </li>
        ))}
      </ol>
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

/** Tone per duty, so Accountable reads as the heaviest and Informed the lightest. */
const DUTY_TONE: Record<string, { chip: string; label: string }> = {
  accountable: { chip: "bg-amber-50 text-amber-700", label: "text-amber-700" },
  responsible: { chip: "bg-blue-50 text-blue-700", label: "text-blue-700" },
  consulted: { chip: "bg-emerald-50 text-emerald-700", label: "text-emerald-700" },
  informed: { chip: "bg-slate-100 text-slate-600", label: "text-slate-600" },
  approves: { chip: "bg-indigo-50 text-indigo-700", label: "text-indigo-700" },
  coApproves: { chip: "bg-indigo-50 text-indigo-700", label: "text-indigo-700" },
  escalationFor: { chip: "bg-rose-50 text-rose-700", label: "text-rose-700" },
};

const DEFAULT_TONE = { chip: "bg-slate-100 text-slate-600", label: "text-slate-600" };

/**
 * One Role's duties, grouped and labelled instead of run together into a
 * sentence — a real process has enough tasks that the sentence form became a
 * paragraph nobody could scan.
 */
function RoleCard({ name, duties }: { name: string; duties: { key: string; label: string; tasks: string[] }[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2">
        <span className="text-sm font-bold text-slate-900">{name}</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {duties.map((duty) => (
            <span
              key={duty.key}
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${(DUTY_TONE[duty.key] ?? DEFAULT_TONE).chip}`}
            >
              {duty.tasks.length} {duty.label}
            </span>
          ))}
        </span>
      </div>
      {duties.map((duty) => (
        <div
          key={duty.key}
          className="grid grid-cols-[110px_1fr] gap-2.5 border-t border-slate-100 px-3.5 py-2 first:border-t-0"
        >
          <span
            className={`pt-0.5 text-[10px] font-bold uppercase tracking-wide ${(DUTY_TONE[duty.key] ?? DEFAULT_TONE).label}`}
          >
            {duty.label}
          </span>
          <span className="text-xs text-slate-700">{duty.tasks.join(" · ")}</span>
        </div>
      ))}
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
