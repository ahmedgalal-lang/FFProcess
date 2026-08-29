"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAuthorityRow, skipAuthorityRow, unskipAuthorityRow, clearAuthorityRow } from "@/lib/actions/authority";
import {
  DIRECTION_LABELS,
  describeAuthorityRule,
  formatMoney,
  formatSla,
  requiresApproval,
  type AuthorityDirection,
  type AuthorityIssue,
  type AuthorityTableRow,
} from "@/lib/domain/authority-table";

type RoleT = { id: string; name: string };
type PersonT = { id: string; name: string };

const DIRECTIONS: AuthorityDirection[] = [
  "GREATER_THAN",
  "GREATER_OR_EQUAL",
  "LESS_THAN",
  "LESS_OR_EQUAL",
  "EQUAL_NO_APPROVAL",
];

type Draft = {
  slaDays: string;
  threshold: string;
  direction: AuthorityDirection;
  approverKey: string; // "" | `role:<id>` | `person:<id>`
  coThreshold: string;
  coApproverRoleId: string;
  escalationRoleId: string;
};

function draftFromRow(row: AuthorityTableRow): Draft {
  return {
    slaDays: row.slaDays === null ? "" : String(row.slaDays),
    threshold: row.threshold === null ? "" : String(row.threshold),
    direction: row.direction,
    approverKey: row.approverRoleId
      ? `role:${row.approverRoleId}`
      : row.approverPersonId
        ? `person:${row.approverPersonId}`
        : "",
    coThreshold: row.coApprovalAboveThreshold === null ? "" : String(row.coApprovalAboveThreshold),
    coApproverRoleId: row.coApproverRoleId ?? "",
    escalationRoleId: row.escalationRoleId ?? "",
  };
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

  function namesFor(row: AuthorityTableRow) {
    return {
      approver: row.approverRoleId
        ? (roleNameById.get(row.approverRoleId) ?? null)
        : row.approverPersonId
          ? (personNameById.get(row.approverPersonId) ?? null)
          : null,
      coApprover: row.coApproverRoleId ? (roleNameById.get(row.coApproverRoleId) ?? null) : null,
      escalation: row.escalationRoleId ? (roleNameById.get(row.escalationRoleId) ?? null) : null,
    };
  }

  function recomputeLocalIssues(next: AuthorityTableRow[]): AuthorityIssue[] {
    const out: AuthorityIssue[] = [];
    for (const r of next) {
      if (r.skipped) continue;
      if (!requiresApproval(r.direction)) continue;
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
    const noGate = draft.direction === "EQUAL_NO_APPROVAL";
    const slaDays = draft.slaDays.trim() === "" ? null : Math.round(Number(draft.slaDays));
    const threshold = noGate || draft.threshold.trim() === "" ? null : Number(draft.threshold);
    const coThreshold = noGate || draft.coThreshold.trim() === "" ? null : Number(draft.coThreshold);
    const [approverType, approverId] = draft.approverKey ? draft.approverKey.split(":") : [null, null];
    const approverRoleId = noGate || approverType !== "role" ? null : approverId!;
    const approverPersonId = noGate || approverType !== "person" ? null : approverId!;
    const coApproverRoleId = noGate ? null : draft.coApproverRoleId || null;
    const escalationRoleId = noGate ? null : draft.escalationRoleId || null;

    const nextRow: AuthorityTableRow = {
      ...row,
      slaDays,
      threshold,
      direction: draft.direction,
      approverRoleId,
      approverPersonId,
      coApprovalAboveThreshold: coThreshold,
      coApproverRoleId,
      escalationRoleId,
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
        slaDays,
        threshold,
        direction: draft.direction,
        approverRoleId,
        approverPersonId,
        coApprovalAboveThreshold: coThreshold,
        coApproverRoleId,
        escalationRoleId,
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
            slaDays: null,
            threshold: null,
            direction: "GREATER_THAN" as AuthorityDirection,
            approverRoleId: null,
            approverPersonId: null,
            coApprovalAboveThreshold: null,
            coApproverRoleId: null,
            escalationRoleId: null,
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
    const names = namesFor(row);
    const noGate = !requiresApproval(row.direction);
    const cellTone = noGate ? "text-slate-500" : "text-slate-700";

    return [
      <tr key={row.id} className={`border-t border-slate-100 ${noGate ? "bg-slate-50" : ""}`}>
        <th
          scope="row"
          className={`sticky left-0 z-10 px-4 py-2 text-left font-medium ${noGate ? "bg-slate-50 text-slate-600" : "bg-white text-slate-900"} ${flagged ? "shadow-[inset_3px_0_0_0_theme(colors.red.400)]" : ""}`}
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
        <td className={`px-3 py-2 text-center font-mono ${cellTone}`}>{formatSla(row.slaDays)}</td>
        <td className={`px-3 py-2 text-center font-mono ${cellTone}`}>
          {row.threshold === null ? "—" : formatMoney(row.threshold)}
        </td>
        <td className="px-3 py-2 text-center">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${
              noGate ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"
            }`}
          >
            <span className="font-mono">{DIRECTION_LABELS[row.direction].symbol}</span>
            {DIRECTION_LABELS[row.direction].label}
          </span>
        </td>
        <td className={`px-3 py-2 text-center ${cellTone}`}>{names.approver ?? "—"}</td>
        <td className={`px-3 py-2 text-center ${cellTone}`}>
          {row.coApprovalAboveThreshold === null ? (
            "—"
          ) : (
            <span className="flex flex-col leading-tight">
              <span>{names.coApprover ?? <span className="text-amber-700">not set</span>}</span>
              <span className="font-mono text-[11px] text-slate-500">
                above {formatMoney(row.coApprovalAboveThreshold)}
              </span>
            </span>
          )}
        </td>
        <td className={`px-3 py-2 text-center ${cellTone}`}>
          {names.escalation ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
              ↑ {names.escalation}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-2 text-center">
          {confirmingClearId === row.id ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-xs text-slate-500">Clear?</span>
              <button
                type="button"
                onClick={() => clearRow(row)}
                className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white"
              >
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
                aria-label={`Edit ${row.label}`}
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
      </tr>,
      <tr key={`${row.id}-rule`} className={noGate ? "bg-slate-50" : "bg-slate-50/60"}>
        <td colSpan={8} className="border-t border-dashed border-slate-200 px-4 pb-2.5 pt-1.5">
          <div className="flex gap-2 text-xs text-slate-600">
            <span className="flex-none text-[10px] font-bold uppercase tracking-wide text-slate-500">Rule</span>
            <span>{describeAuthorityRule(row, names)}</span>
          </div>
        </td>
      </tr>,
    ];
  }

  function renderEditingRow(row: AuthorityTableRow) {
    if (!draft) return null;
    const noGate = draft.direction === "EQUAL_NO_APPROVAL";
    return (
      <tr key={row.id} className="border-t border-slate-100 bg-indigo-50/40">
        <th scope="row" className="sticky left-0 z-10 bg-indigo-50 px-4 py-2 text-left font-medium text-slate-900">
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
          <input
            type="number"
            min="0"
            step="1"
            value={draft.slaDays}
            onChange={(e) => setDraft({ ...draft, slaDays: e.target.value })}
            placeholder="days"
            aria-label={`SLA in days for ${row.label}`}
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </td>
        <td className="px-2 py-2 text-center">
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.threshold}
            onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
            placeholder="$"
            disabled={noGate}
            aria-label={`Amount for ${row.label}`}
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:opacity-50"
          />
        </td>
        <td className="px-2 py-2 text-center">
          <select
            value={draft.direction}
            onChange={(e) => setDraft({ ...draft, direction: e.target.value as AuthorityDirection })}
            aria-label={`Direction for ${row.label}`}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {DIRECTION_LABELS[d].label} ({DIRECTION_LABELS[d].symbol})
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-2 text-center">
          <select
            value={draft.approverKey}
            onChange={(e) => setDraft({ ...draft, approverKey: e.target.value })}
            disabled={noGate}
            aria-label={`Approver for ${row.label}`}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:opacity-50"
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
          <div className="inline-flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.coThreshold}
              onChange={(e) => setDraft({ ...draft, coThreshold: e.target.value })}
              placeholder="above $"
              disabled={noGate}
              aria-label={`Co-approval amount for ${row.label}`}
              className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:opacity-50"
            />
            <select
              value={draft.coApproverRoleId}
              onChange={(e) => setDraft({ ...draft, coApproverRoleId: e.target.value })}
              disabled={noGate || !draft.coThreshold.trim()}
              aria-label={`Co-approver for ${row.label}`}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:opacity-50"
            >
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </td>
        <td className="px-2 py-2 text-center">
          <select
            value={draft.escalationRoleId}
            onChange={(e) => setDraft({ ...draft, escalationRoleId: e.target.value })}
            disabled={noGate}
            aria-label={`Escalation role for ${row.label}`}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:opacity-50"
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
          Every task that needs approval has an approver (and a co-approver wherever a co-approval amount is set).
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {issues.length} task{issues.length > 1 ? "s" : ""} need an approver (or co-approver) — assign one, mark the
          task as needing no approval, or skip it.
        </div>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm" aria-label="Authority Matrix by task">
          <caption className="sr-only">
            Each task carries an SLA in days, the money amount its rule turns on, which side of that amount needs
            approval, the approver, an optional co-approval tier, and who it escalates to. Column titles stay visible
            while you scroll.
          </caption>
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 bg-slate-50 px-4 py-2">
                Task
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                SLA
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Amount
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Direction
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Approval
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Co-approval
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-center">
                Escalation
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
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-left font-medium text-slate-600 line-through"
                >
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
