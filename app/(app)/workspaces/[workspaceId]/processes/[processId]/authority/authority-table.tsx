"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAuthorityRow, skipAuthorityRow, unskipAuthorityRow, clearAuthorityRow } from "@/lib/actions/authority";
import type { AuthorityIssue, AuthorityTableRow, AuthorityUnit } from "@/lib/domain/authority-table";

type RoleT = { id: string; name: string };
type PersonT = { id: string; name: string };

type Draft = {
  unit: AuthorityUnit;
  threshold: string;
  approverKey: string; // "" | `role:<id>` | `person:<id>`
  coThreshold: string;
  coApproverRoleId: string;
};

function draftFromRow(row: AuthorityTableRow): Draft {
  return {
    unit: row.unit,
    threshold: row.threshold === null ? "" : String(row.threshold),
    approverKey: row.approverRoleId ? `role:${row.approverRoleId}` : row.approverPersonId ? `person:${row.approverPersonId}` : "",
    coThreshold: row.coApprovalAboveThreshold === null ? "" : String(row.coApprovalAboveThreshold),
    coApproverRoleId: row.coApproverRoleId ?? "",
  };
}

function formatThreshold(unit: AuthorityUnit, value: number | null): string {
  if (value === null) return "—";
  return unit === "MONEY" ? `$${value.toLocaleString()}` : `${value} day${value === 1 ? "" : "s"}`;
}

export function AuthorityTable({
  workspaceId,
  processId,
  roles,
  people,
  initialRows,
  initialIssues,
}: {
  workspaceId: string;
  processId: string;
  roles: RoleT[];
  people: PersonT[];
  initialRows: AuthorityTableRow[];
  initialIssues: AuthorityIssue[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [issues, setIssues] = useState(initialIssues);
  const [pending, startTransition] = useTransition();
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmingClearId, setConfirmingClearId] = useState<string | null>(null);
  const router = useRouter();

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));
  const visibleRows = rows.filter((r) => !r.skipped);
  const skippedRows = rows.filter((r) => r.skipped);

  function recomputeLocalIssues(next: AuthorityTableRow[]): AuthorityIssue[] {
    const out: AuthorityIssue[] = [];
    for (const r of next) {
      if (r.skipped) continue;
      if (r.approverRoleId === null && r.approverPersonId === null) out.push({ rowId: r.id, type: "MISSING_APPROVER" });
      if (r.coApprovalAboveThreshold !== null && r.coApproverRoleId === null) {
        out.push({ rowId: r.id, type: "MISSING_CO_APPROVER" });
      }
    }
    return out;
  }

  function startEdit(row: AuthorityTableRow) {
    setEditingRowId(row.id);
    setDraft(draftFromRow(row));
  }

  function saveEdit(row: AuthorityTableRow) {
    if (!draft) return;
    const threshold = draft.threshold.trim() === "" ? null : Number(draft.threshold);
    const coThreshold = draft.coThreshold.trim() === "" ? null : Number(draft.coThreshold);
    const [approverType, approverId] = draft.approverKey ? draft.approverKey.split(":") : [null, null];
    const approverRoleId = approverType === "role" ? approverId : null;
    const approverPersonId = approverType === "person" ? approverId : null;
    const coApproverRoleId = draft.coApproverRoleId || null;

    const nextRow: AuthorityTableRow = {
      ...row,
      unit: draft.unit,
      threshold,
      approverRoleId,
      approverPersonId,
      coApprovalAboveThreshold: coThreshold,
      coApproverRoleId,
      skipped: false,
    };
    const nextRows = rows.map((r) => (r.id === row.id ? nextRow : r));
    setRows(nextRows);
    setIssues(recomputeLocalIssues(nextRows));
    setEditingRowId(null);
    setDraft(null);

    startTransition(async () => {
      await saveAuthorityRow({
        workspaceId,
        processId,
        rowId: row.id,
        kind: row.kind,
        unit: draft.unit,
        threshold,
        approverRoleId,
        approverPersonId,
        coApprovalAboveThreshold: coThreshold,
        coApproverRoleId,
      });
      router.refresh();
    });
  }

  function toggleSkip(row: AuthorityTableRow) {
    const nextRows = rows.map((r) => (r.id === row.id ? { ...r, skipped: !r.skipped } : r));
    setRows(nextRows);
    setIssues(recomputeLocalIssues(nextRows));

    startTransition(async () => {
      if (row.skipped) {
        await unskipAuthorityRow({ workspaceId, processId, rowId: row.id, kind: row.kind });
      } else {
        await skipAuthorityRow({ workspaceId, processId, rowId: row.id, kind: row.kind });
      }
      router.refresh();
    });
  }

  function clearRow(row: AuthorityTableRow) {
    const nextRows = rows.map((r) =>
      r.id === row.id
        ? {
            ...r,
            skipped: false,
            threshold: null,
            approverRoleId: null,
            approverPersonId: null,
            coApprovalAboveThreshold: null,
            coApproverRoleId: null,
          }
        : r
    );
    setRows(nextRows);
    setIssues(recomputeLocalIssues(nextRows));
    setConfirmingClearId(null);

    startTransition(async () => {
      await clearAuthorityRow({ workspaceId, processId, rowId: row.id, kind: row.kind });
      router.refresh();
    });
  }

  const flaggedRowIds = new Set(issues.map((i) => i.rowId));

  function renderStaticRow(row: AuthorityTableRow, flagged: boolean) {
    const approverLabel = row.approverRoleId
      ? roleNameById.get(row.approverRoleId)
      : row.approverPersonId
        ? personNameById.get(row.approverPersonId)
        : null;
    const coApproverLabel = row.coApproverRoleId ? roleNameById.get(row.coApproverRoleId) : null;

    return (
      <tr key={row.id} className="border-t border-slate-100">
        <th
          scope="row"
          className={`sticky left-0 z-10 bg-white px-4 py-2 text-left font-medium text-slate-900 ${flagged ? "shadow-[inset_3px_0_0_0_theme(colors.red.400)]" : ""}`}
        >
          <div className="flex items-center gap-2">
            {row.stepType && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                {row.stepType}
              </span>
            )}
            <span>{row.label}</span>
          </div>
          {flagged && <span className="sr-only"> — has a validation issue</span>}
        </th>
        <td className="px-3 py-2 text-center text-slate-600">{row.unit === "MONEY" ? "$" : "days"}</td>
        <td className="px-3 py-2 text-center font-mono text-slate-700">{formatThreshold(row.unit, row.threshold)}</td>
        <td className="px-3 py-2 text-center text-slate-700">{approverLabel ?? <span className="text-slate-500">—</span>}</td>
        <td className="px-3 py-2 text-center font-mono text-slate-700">
          {formatThreshold(row.unit, row.coApprovalAboveThreshold)}
        </td>
        <td className="px-3 py-2 text-center text-slate-700">
          {coApproverLabel ?? <span className="text-slate-500">—</span>}
        </td>
        <td className="px-3 py-2 text-center">
          {confirmingClearId === row.id ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-xs text-slate-500">Clear?</span>
              <button type="button" onClick={() => clearRow(row)} className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClearId(null)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
              >
                No
              </button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => startEdit(row)}
                className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-700"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => toggleSkip(row)}
                className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-700"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClearId(row.id)}
                className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600"
              >
                Delete
              </button>
            </span>
          )}
        </td>
      </tr>
    );
  }

  function renderEditingRow(row: AuthorityTableRow) {
    if (!draft) return null;
    return (
      <tr key={row.id} className="border-t border-slate-100 bg-slate-50">
        <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-left font-medium text-slate-900">
          <div className="flex items-center gap-2">
            {row.stepType && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                {row.stepType}
              </span>
            )}
            <span>{row.label}</span>
          </div>
        </th>
        <td className="px-2 py-2 text-center">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, unit: "MONEY" })}
              className={`px-2 py-1 font-semibold ${draft.unit === "MONEY" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
            >
              $
            </button>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, unit: "DAYS" })}
              className={`px-2 py-1 font-semibold ${draft.unit === "DAYS" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
            >
              days
            </button>
          </div>
        </td>
        <td className="px-2 py-2 text-center">
          <input
            type="number"
            min="0"
            step={draft.unit === "MONEY" ? "0.01" : "1"}
            value={draft.threshold}
            onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
            placeholder={draft.unit === "MONEY" ? "$" : "days"}
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </td>
        <td className="px-2 py-2 text-center">
          <select
            value={draft.approverKey}
            onChange={(e) => setDraft({ ...draft, approverKey: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">—</option>
            <optgroup label="Roles">
              {roles.map((r) => (
                <option key={r.id} value={`role:${r.id}`}>
                  {r.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="People">
              {people.map((p) => (
                <option key={p.id} value={`person:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
        </td>
        <td className="px-2 py-2 text-center">
          <input
            type="number"
            min="0"
            step={draft.unit === "MONEY" ? "0.01" : "1"}
            value={draft.coThreshold}
            onChange={(e) => setDraft({ ...draft, coThreshold: e.target.value })}
            placeholder="optional"
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </td>
        <td className="px-2 py-2 text-center">
          <select
            value={draft.coApproverRoleId}
            onChange={(e) => setDraft({ ...draft, coApproverRoleId: e.target.value })}
            disabled={!draft.coThreshold.trim()}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
          >
            <option value="">—</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-2 text-center">
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => saveEdit(row)}
              className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingRowId(null);
                setDraft(null);
              }}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
          </span>
        </td>
      </tr>
    );
  }

  return (
    <div>
      {issues.length === 0 ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Every task has an approver (and a co-approver wherever a co-approval threshold is set).
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {issues.length} task{issues.length > 1 ? "s" : ""} need an approver (or co-approver) — assign one or mark
          as skipped.
        </div>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm" aria-label="Authority Matrix by task">
          <caption className="sr-only">
            Each task can have a threshold, an approver, and — above a second threshold — a required co-approver.
            Column titles stay visible while you scroll.
          </caption>
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 bg-slate-50 px-4 py-2">
                Task
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Unit
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Threshold
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Approver
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Co-approval above
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Co-approver
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) =>
              editingRowId === row.id ? renderEditingRow(row) : renderStaticRow(row, flaggedRowIds.has(row.id))
            )}
            {skippedRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 bg-slate-50">
                <th scope="row" className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-left font-medium text-slate-600 line-through">
                  <div className="flex items-center gap-2">
                    {row.stepType && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                        {row.stepType}
                      </span>
                    )}
                    <span>{row.label}</span>
                  </div>
                </th>
                <td className="px-3 py-2 text-center text-slate-600">—</td>
                <td className="px-3 py-2 text-center text-slate-600">—</td>
                <td className="px-3 py-2 text-center text-slate-600">—</td>
                <td className="px-3 py-2 text-center text-slate-600">—</td>
                <td className="px-3 py-2 text-center text-slate-600">—</td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => toggleSkip(row)}
                    disabled={pending}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                  >
                    Skipped ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
