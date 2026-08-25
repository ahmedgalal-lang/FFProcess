"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { OrgChartCanvas } from "../../org/chart/org-chart-canvas";
import { StaticProcessMapDiagram } from "../../processes/[processId]/map/static-process-map-diagram";
import { draftProcessReportSections } from "@/lib/actions/export-report";
import type { RaciCode, StepType } from "@/lib/domain/raci-table";
import type { AuthorityUnit } from "@/lib/domain/authority-table";
import type { ProcessReportDraft } from "@/lib/ai/process-report";

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
  matrixRoles: { id: string; name: string }[];
  combinedRows: {
    rowId: string;
    label: string;
    stepType: StepType | null;
    raci: Record<string, RaciCode>;
    unit: AuthorityUnit;
    threshold: number | null;
    approverLabel: string | null;
    coApprovalAboveThreshold: number | null;
    coApproverLabel: string | null;
  }[];
  involvedRoles: { id: string; name: string; involvement: string }[];
  controlPoints: { rowId: string; statement: string; flagged: boolean }[];
  processOwnerName: string | null;
  triggerLabel: string | null;
  outputLabel: string | null;
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
          textarea, input { border: none !important; padding: 0 !important; }
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
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-secondary)]">
            Company Report
          </div>
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
          <ProcessReportSection key={process.id} workspaceId={workspaceId} process={process} />
        ))}
      </main>
    </>
  );
}

function emptyDraft(): ProcessReportDraft {
  return { processPurpose: "", inScope: [], outOfScope: [], externalEntities: [], steps: [], kpis: [] };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
  const [meta, setMeta] = useState({
    documentId: `${process.code}-${new Date().getFullYear()}`,
    version: "1.0",
    effectiveDate: todayIso(),
    reviewCycle: "Annual",
  });
  const [draft, setDraft] = useState<ProcessReportDraft>(emptyDraft());
  const [draftStatus, setDraftStatus] = useState<"idle" | "done" | "unavailable" | "error">("idle");
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runDraft() {
    setDraftMessage(null);
    startTransition(async () => {
      const result = await draftProcessReportSections({ workspaceId, processId: process.id });
      if (!result.ok) {
        if (result.error === "AI_UNAVAILABLE") {
          setDraftStatus("unavailable");
          setDraftMessage(result.message);
        } else {
          setDraftStatus("error");
          setDraftMessage(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not draft") : result.error);
        }
        return;
      }
      setDraft(result.data);
      setDraftStatus("done");
    });
  }

  const stepDraftByRowId = new Map(draft.steps.map((s) => [s.rowId, s]));
  const matrixRoleNameById = new Map(process.matrixRoles.map((r) => [r.id, r.name]));

  function stepOwnerLabel(row: ExportProcessData["combinedRows"][number]): string {
    const accountableRoleId = Object.entries(row.raci).find(([, code]) => code === "ACCOUNTABLE")?.[0];
    if (accountableRoleId) return matrixRoleNameById.get(accountableRoleId) ?? "—";
    return row.approverLabel ?? "—";
  }

  return (
    <section className="print-page">
      <div className="border-b-2 border-slate-300 pb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-secondary)]">
          Business Process Documentation &amp; Procedure Standard
        </div>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">{process.name}</h2>
        {process.description && <p className="mt-1 text-sm text-slate-500">{process.description}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs sm:grid-cols-3">
          <MetaField label="Document ID" value={meta.documentId} onChange={(v) => setMeta({ ...meta, documentId: v })} />
          <MetaField label="Version" value={meta.version} onChange={(v) => setMeta({ ...meta, version: v })} />
          <MetaField
            label="Effective Date"
            value={meta.effectiveDate}
            onChange={(v) => setMeta({ ...meta, effectiveDate: v })}
          />
          <MetaField label="Review Cycle" value={meta.reviewCycle} onChange={(v) => setMeta({ ...meta, reviewCycle: v })} />
          <div>
            <dt className="text-slate-500">Process Owner</dt>
            <dd className="font-semibold text-slate-900">{process.processOwnerName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Process Code</dt>
            <dd className="font-mono font-semibold text-slate-900">{process.code}</dd>
          </div>
        </dl>
      </div>

      <div className="no-print mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
        <button
          type="button"
          onClick={runDraft}
          disabled={pending}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Drafting…" : draftStatus === "done" ? "↻ Re-draft narrative with AI" : "✨ Draft narrative with AI"}
        </button>
        {draftStatus === "unavailable" && <span className="text-xs text-amber-700">{draftMessage}</span>}
        {draftStatus === "error" && <span className="text-xs text-red-600">{draftMessage}</span>}
        {draftStatus === "done" && (
          <span className="text-xs text-emerald-700">Drafted — review and edit the fields below before exporting.</span>
        )}
      </div>

      <SectionHeading num="1.0" title="Executive Summary" />
      <SubHeading>Process Purpose</SubHeading>
      <EditableText
        value={draft.processPurpose}
        placeholder="Why this process exists and what it standardizes — draft with AI above, or write it yourself."
        onChange={(v) => setDraft({ ...draft, processPurpose: v })}
        rows={3}
        ariaLabel="Process Purpose"
      />

      <div className="mt-3 grid grid-cols-2 gap-4">
        <ScopeBox label="Process Trigger" value={process.triggerLabel} />
        <ScopeBox label="Process Output" value={process.outputLabel} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <BulletEditor
          label="In-Scope"
          items={draft.inScope}
          onChange={(items) => setDraft({ ...draft, inScope: items })}
        />
        <BulletEditor
          label="Out-of-Scope"
          items={draft.outOfScope}
          onChange={(items) => setDraft({ ...draft, outOfScope: items })}
        />
      </div>

      <SectionHeading num="2.0" title="Involved Parties & Ecosystem" />
      <SubHeading>Internal Roles</SubHeading>
      {process.involvedRoles.length === 0 ? (
        <p className="text-sm text-slate-500">No roles assigned to this process yet.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {process.involvedRoles.map((r) => (
            <li key={r.id}>
              <strong className="text-slate-900">{r.name}</strong> — {r.involvement}
            </li>
          ))}
        </ul>
      )}
      <SubHeading>External Entities</SubHeading>
      <EntityEditor
        items={draft.externalEntities}
        onChange={(items) => setDraft({ ...draft, externalEntities: items })}
      />

      <SectionHeading num="3.0" title="RACI & Authority Matrix" />
      <p className="text-sm text-slate-500">
        Each task&rsquo;s responsibility assignment and its approval limits, combined into one table.
      </p>
      {process.combinedRows.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No RACI or Authority data yet.
        </p>
      ) : (
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
                <th className="px-3 py-2">Delegated Authority &amp; Limits</th>
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
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {row.approverLabel ? (
                      <>
                        {formatThreshold(row.unit, row.threshold)} — {row.approverLabel}
                        {row.coApproverLabel && row.coApprovalAboveThreshold !== null && (
                          <>
                            ; co-approval from {row.coApproverLabel} above {formatThreshold(row.unit, row.coApprovalAboveThreshold)}
                          </>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SectionHeading num="4.0" title="Process Workflow & Narrative" />
      {process.steps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No steps added yet.
        </p>
      ) : (
        <StaticProcessMapDiagram workspaceId={workspaceId} steps={process.steps} connections={process.connections} />
      )}

      {process.combinedRows.map((row) => {
        const narrative = stepDraftByRowId.get(row.rowId);
        return (
          <div key={row.rowId} className="mt-3 rounded-xl border border-slate-200 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-slate-900">{row.label}</span>
              <span className="text-xs text-slate-500">Step Owner: {stepOwnerLabel(row)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Detailed Action</div>
                <EditableText
                  value={(narrative?.detailedAction ?? []).join("\n")}
                  placeholder="One action per line — draft with AI above, or write it yourself."
                  onChange={(v) =>
                    setDraft({
                      ...draft,
                      steps: upsertStep(draft.steps, row.rowId, { detailedAction: v.split("\n").filter(Boolean) }),
                    })
                  }
                  rows={3}
                  ariaLabel={`Detailed Action for ${row.label}`}
                />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Exception Handling</div>
                <EditableText
                  value={narrative?.exceptionHandling ?? ""}
                  placeholder="What happens if this step doesn't go as planned."
                  onChange={(v) =>
                    setDraft({ ...draft, steps: upsertStep(draft.steps, row.rowId, { exceptionHandling: v }) })
                  }
                  rows={3}
                  ariaLabel={`Exception Handling for ${row.label}`}
                />
              </div>
            </div>
          </div>
        );
      })}

      <SectionHeading num="5.0" title="Governance, Controls & Metrics" />
      <SubHeading>Key Control Points</SubHeading>
      {process.controlPoints.length === 0 ? (
        <p className="text-sm text-slate-500">No co-approval controls in this process&rsquo;s Authority Matrix yet.</p>
      ) : (
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
      )}

      <SubHeading>Operational KPIs &amp; SLAs</SubHeading>
      <KpiEditor items={draft.kpis} onChange={(items) => setDraft({ ...draft, kpis: items })} />
    </section>
  );
}

function upsertStep(
  steps: ProcessReportDraft["steps"],
  rowId: string,
  patch: Partial<ProcessReportDraft["steps"][number]>
): ProcessReportDraft["steps"] {
  const existing = steps.find((s) => s.rowId === rowId);
  if (existing) {
    return steps.map((s) => (s.rowId === rowId ? { ...s, ...patch } : s));
  }
  return [...steps, { rowId, detailedAction: [], exceptionHandling: "", ...patch }];
}

function MetaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd>
        <input
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border-b border-dashed border-slate-300 bg-transparent py-0.5 font-semibold text-slate-900 focus:border-solid focus:border-slate-500 focus:outline-none"
        />
      </dd>
    </div>
  );
}

function ScopeBox({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-800">{value ?? "Not set on the Process Map yet"}</div>
    </div>
  );
}

function EditableText({
  value,
  placeholder,
  onChange,
  rows,
  ariaLabel,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  rows: number;
  ariaLabel: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
    />
  );
}

function BulletEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <EditableText
        value={items.join("\n")}
        placeholder="One item per line."
        onChange={(v) => onChange(v.split("\n").filter(Boolean))}
        rows={3}
        ariaLabel={label}
      />
    </div>
  );
}

function EntityEditor({
  items,
  onChange,
}: {
  items: { name: string; description: string }[];
  onChange: (items: { name: string; description: string }[]) => void;
}) {
  function update(i: number, patch: Partial<{ name: string; description: string }>) {
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item.name}
            aria-label="Entity name"
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Entity name"
            className="w-40 flex-none rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold"
          />
          <input
            value={item.description}
            aria-label="Entity description"
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="One sentence on its role"
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
          <button type="button" onClick={() => remove(i)} className="no-print text-xs text-slate-400 hover:text-red-600">
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { name: "", description: "" }])}
        className="no-print text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        + Add entity
      </button>
    </div>
  );
}

function KpiEditor({
  items,
  onChange,
}: {
  items: { metric: string; target: string; frequency: string }[];
  onChange: (items: { metric: string; target: string; frequency: string }[]) => void;
}) {
  function update(i: number, patch: Partial<{ metric: string; target: string; frequency: string }>) {
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Metric</th>
            <th className="px-3 py-2">Target</th>
            <th className="px-3 py-2">Frequency</th>
            <th className="no-print px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-sm text-slate-500">
                No metrics yet — draft with AI, or add one below.
              </td>
            </tr>
          ) : (
            items.map((item, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-2 py-1.5">
                  <input
                    value={item.metric}
                    aria-label="Metric"
                    onChange={(e) => update(i, { metric: e.target.value })}
                    className="w-full rounded border border-transparent px-1 py-0.5 focus:border-slate-300 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={item.target}
                    aria-label="Target"
                    onChange={(e) => update(i, { target: e.target.value })}
                    className="w-full rounded border border-transparent px-1 py-0.5 focus:border-slate-300 focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={item.frequency}
                    aria-label="Frequency"
                    onChange={(e) => update(i, { frequency: e.target.value })}
                    className="w-full rounded border border-transparent px-1 py-0.5 focus:border-slate-300 focus:outline-none"
                  />
                </td>
                <td className="no-print px-2 py-1.5 text-right">
                  <button type="button" onClick={() => remove(i)} className="text-xs text-slate-400 hover:text-red-600">
                    ✕
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="border-t border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={() => onChange([...items, { metric: "", target: "", frequency: "" }])}
          className="no-print text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          + Add metric
        </button>
      </div>
    </div>
  );
}
