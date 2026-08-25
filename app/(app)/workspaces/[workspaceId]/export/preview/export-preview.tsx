"use client";

import Link from "next/link";
import { OrgChartCanvas } from "../../org/chart/org-chart-canvas";
import { StaticProcessMapDiagram } from "../../processes/[processId]/map/static-process-map-diagram";
import type { RaciCode } from "@/lib/domain/raci-table";
import type { AuthorityUnit } from "@/lib/domain/authority-table";

type PersonT = { id: string; name: string; managerId: string | null; roleNames: string[] };

export type ExportProcessData = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  steps: {
    id: string;
    type: "START" | "TASK" | "DECISION" | "END";
    label: string;
    positionX: number;
    positionY: number;
    assignedRole: { id: string; name: string } | null;
    swimlaneRole: { id: string; name: string } | null;
    links: { id: string; targetProcessId: string; targetProcess: { code: string; name: string } }[];
  }[];
  connections: { id: string; fromStepId: string; toStepId: string; label: string | null }[];
  raciRoles: { id: string; name: string }[];
  raciRows: { id: string; label: string; stepType: string | null; assignments: Record<string, RaciCode> }[];
  authorityRows: {
    id: string;
    label: string;
    unit: AuthorityUnit;
    threshold: number | null;
    approverLabel: string | null;
    coApprovalAboveThreshold: number | null;
    coApproverLabel: string | null;
  }[];
};

const CODE_LETTER: Record<RaciCode, string> = {
  RESPONSIBLE: "R",
  ACCOUNTABLE: "A",
  CONSULTED: "C",
  INFORMED: "I",
};

function formatThreshold(unit: AuthorityUnit, value: number | null): string {
  if (value === null) return "—";
  return unit === "MONEY" ? `$${value.toLocaleString()}` : `${value} day${value === 1 ? "" : "s"}`;
}

export function ExportPreview({
  workspaceId,
  companyName,
  industry,
  description,
  people,
  processes,
}: {
  workspaceId: string;
  companyName: string;
  industry: string | null;
  description: string | null;
  people: PersonT[];
  processes: ExportProcessData[];
}) {
  return (
    <>
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

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <section className="print-page min-h-[70vh]">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Company Report</div>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{companyName}</h1>
          {industry && <p className="mt-2 text-sm font-semibold text-slate-500">{industry}</p>}
          {description ? (
            <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {description}
            </p>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No company summary added yet.</p>
          )}
          <p className="mt-8 text-xs text-slate-500">
            Generated on {new Date().toLocaleDateString()} · Covers {processes.length} process
            {processes.length === 1 ? "" : "es"}
          </p>
        </section>

        <section className="print-page">
          <h2 className="text-xl font-semibold text-slate-900">Org Structure</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500">Reporting lines across {companyName}.</p>
          {people.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              No people added yet.
            </p>
          ) : (
            <OrgChartCanvas people={people} />
          )}
        </section>

        {processes.map((process) => (
          <ProcessSection key={process.id} workspaceId={workspaceId} process={process} />
        ))}
      </main>
    </>
  );
}

function ProcessSection({ workspaceId, process }: { workspaceId: string; process: ExportProcessData }) {
  return (
    <section className="print-page">
      <div className="text-xs font-mono font-semibold text-slate-500">{process.code}</div>
      <h2 className="text-xl font-semibold text-slate-900">{process.name}</h2>
      {process.description && <p className="mt-1 text-sm text-slate-500">{process.description}</p>}

      <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Process Map</h3>
      {process.steps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No steps added yet.
        </p>
      ) : (
        <StaticProcessMapDiagram workspaceId={workspaceId} steps={process.steps} connections={process.connections} />
      )}

      <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">RACI Matrix</h3>
      {process.raciRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No RACI assignments yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Task</th>
                {process.raciRoles.map((r) => (
                  <th key={r.id} className="px-3 py-2 text-center">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {process.raciRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                  {process.raciRoles.map((r) => {
                    const code = row.assignments[r.id] as RaciCode | undefined;
                    return (
                      <td key={r.id} className="px-3 py-2 text-center font-mono text-xs font-bold text-slate-600">
                        {code ? CODE_LETTER[code] : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Authority Matrix</h3>
      {process.authorityRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No authority entries yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2 text-center">Threshold</th>
                <th className="px-3 py-2 text-center">Approver</th>
                <th className="px-3 py-2 text-center">Co-approval above</th>
                <th className="px-3 py-2 text-center">Co-approver</th>
              </tr>
            </thead>
            <tbody>
              {process.authorityRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                  <td className="px-3 py-2 text-center font-mono text-slate-700">
                    {formatThreshold(row.unit, row.threshold)}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-700">{row.approverLabel ?? "—"}</td>
                  <td className="px-3 py-2 text-center font-mono text-slate-700">
                    {formatThreshold(row.unit, row.coApprovalAboveThreshold)}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-700">{row.coApproverLabel ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
