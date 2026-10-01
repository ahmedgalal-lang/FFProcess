"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CloneProcessButton, EditProcessButton, ArchiveProcessButton } from "./process-forms";

type ProcessOption = { id: string; code: string; name: string; steps: { id: string; label: string }[] };
type CategoryOption = { id: string; name: string };

export type ProcessTableRow = {
  id: string;
  depth: number;
  code: string;
  name: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  parentProcessId: string | null;
  parentCode: string | null;
  parentArchived: boolean;
  branchFromStepId: string | null;
  branchFrom: { processId: string; code: string; label: string } | null;
  stepCount: number;
  raci: "FINAL" | "DRAFT" | null;
};

type ColumnId = "code" | "name" | "category" | "steps" | "raci";

/** What a row shows in each filterable column — the values a filter offers. */
function valueOf(row: ProcessTableRow, column: ColumnId): string {
  switch (column) {
    case "code":
      return row.code;
    case "name":
      return row.name;
    case "category":
      return row.categoryName ?? "";
    case "steps":
      return String(row.stepCount);
    case "raci":
      return row.raci ?? "";
  }
}

const RACI_LABEL: Record<string, string> = { FINAL: "Final", DRAFT: "Draft", "": "Not started" };

function labelOf(column: ColumnId, value: string): string {
  if (column === "raci") return RACI_LABEL[value] ?? value;
  if (column === "category" && value === "") return "(No category)";
  return value;
}

/** Numbers in number order, everything else alphabetically, blanks last. */
function sortValues(column: ColumnId, values: string[]): string[] {
  if (column === "steps") return [...values].sort((a, b) => Number(a) - Number(b));
  if (column === "raci") return ["FINAL", "DRAFT", ""].filter((v) => values.includes(v));
  return [...values].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, undefined, { numeric: true })));
}

/**
 * The Processes list with a filter on each column heading, the way a
 * spreadsheet does it: open a column's filter and tick the values to show.
 * Filters combine, and only ever hide rows — nothing is changed.
 */
export function ProcessTable({
  workspaceId,
  rows,
  processOptions,
  categories,
  emptyMessage,
}: {
  workspaceId: string;
  rows: ProcessTableRow[];
  processOptions: ProcessOption[];
  categories: CategoryOption[];
  emptyMessage: string;
}) {
  /** Per column, the values to show; a column not in the map isn't filtered. */
  const [filters, setFilters] = useState<Partial<Record<ColumnId, Set<string>>>>({});

  const matches = (row: ProcessTableRow, except?: ColumnId) =>
    (Object.entries(filters) as [ColumnId, Set<string>][]).every(
      ([column, allowed]) => column === except || allowed.has(valueOf(row, column))
    );
  const shown = rows.filter((row) => matches(row));
  const active = Object.keys(filters).length > 0;

  function setColumn(column: ColumnId, allowed: Set<string> | null) {
    setFilters((prev) => {
      const next = { ...prev };
      if (allowed) next[column] = allowed;
      else delete next[column];
      return next;
    });
  }

  const header = (column: ColumnId, title: string, className = "") => {
    // Offered values come from the rows the *other* filters leave, as in a
    // spreadsheet, so a choice never leads to an empty list by surprise.
    const values = sortValues(column, [...new Set(rows.filter((r) => matches(r, column)).map((r) => valueOf(r, column)))]);
    return (
      <th scope="col" className={`px-4 py-2 ${className}`}>
        <span className="inline-flex items-center gap-1">
          {title}
          <ColumnFilter
            title={title}
            options={values.map((v) => ({ value: v, label: labelOf(column, v) }))}
            selected={filters[column] ?? null}
            onChange={(allowed) => setColumn(column, allowed)}
          />
        </span>
      </th>
    );
  };

  return (
    <>
      <div className="mt-4 flex min-h-5 flex-wrap items-center gap-3 text-xs text-slate-600" role="status">
        {active && (
          <>
            <span>
              Showing {shown.length} of {rows.length} processes
            </span>
            <button type="button" onClick={() => setFilters({})} className="font-semibold text-indigo-700 hover:text-indigo-900">
              Clear filters
            </button>
          </>
        )}
      </div>
      <div className="mt-1 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-start text-xs font-semibold uppercase text-slate-500">
            <tr>
              {header("code", "Code")}
              {header("name", "Process")}
              {header("category", "Category")}
              {header("steps", "Steps")}
              {header("raci", "RACI")}
              <th className="px-4 py-2 text-end">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">
                  {/* Indented by how deep it actually sits, so a sub-process of
                      a sub-process reads as one rather than as a sibling of
                      its own parent. */}
                  {p.depth > 0 ? (
                    <span className="me-1 text-slate-300" style={{ paddingInlineStart: (p.depth - 1) * 12 }}>
                      ↳
                    </span>
                  ) : null}
                  {p.code}
                </td>
                <td className="px-4 py-2 font-medium text-slate-900">
                  {p.name}
                  {p.parentProcessId && (
                    <span className="ms-2 text-xs font-normal text-slate-500">
                      sub-process of {p.parentCode}
                      {/* The parent is loaded regardless of its own deletion, so
                          without this the row named a code that is nowhere on
                          the list — the child looked misfiled rather than
                          orphaned. */}
                      {p.parentArchived ? " (deleted)" : ""}
                    </span>
                  )}
                  {p.branchFrom && (
                    <span className="block text-xs font-normal text-amber-700">
                      ↰ branches from {p.branchFrom.code} · {p.branchFrom.label}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {p.categoryName ? (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      {p.categoryName}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">{p.stepCount}</td>
                <td className="px-4 py-2">
                  {p.raci ? (
                    <span
                      className={
                        p.raci === "FINAL"
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                          : "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
                      }
                    >
                      {p.raci === "FINAL" ? "Final" : "Draft"}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-end">
                  <div className="flex items-center justify-end gap-3">
                    <EditProcessButton
                      workspaceId={workspaceId}
                      process={{
                        id: p.id,
                        code: p.code,
                        name: p.name,
                        description: p.description,
                        categoryId: p.categoryId,
                        parentProcessId: p.parentProcessId,
                        branchFromStepId: p.branchFromStepId,
                        branchFromProcessId: p.branchFrom?.processId ?? null,
                      }}
                      processes={processOptions}
                      categories={categories}
                    />
                    <CloneProcessButton
                      workspaceId={workspaceId}
                      sourceProcessId={p.id}
                      sourceName={p.name}
                      sourceParentProcessId={p.parentProcessId}
                      processes={processOptions}
                    />
                    <ArchiveProcessButton workspaceId={workspaceId} processId={p.id} />
                    <Link
                      href={`/workspaces/${workspaceId}/processes/${p.id}/map`}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                    >
                      Open →
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {rows.length > 0 ? "No processes match these filters." : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * One column's filter: a funnel button that opens a list of the column's
 * values to tick, with a search box for long lists and Select all. Changes
 * apply as they're made. Esc or a click outside closes it.
 */
function ColumnFilter({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: { value: string; label: string }[];
  /** The values shown, or null when the column isn't filtered. */
  selected: Set<string> | null;
  onChange: (allowed: Set<string> | null) => void;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = selected !== null;

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const visible = options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()));
  const isChecked = (value: string) => selected === null || selected.has(value);
  const allVisibleChecked = visible.every((o) => isChecked(o.value));

  function toggle(value: string) {
    const next = new Set(selected ?? options.map((o) => o.value));
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Everything ticked again is the same as no filter at all.
    onChange(options.every((o) => next.has(o.value)) ? null : next);
  }

  function toggleAllVisible() {
    // With a search typed, this works on exactly what the search found, as a
    // spreadsheet's does: ticking selects only those values, clearing leaves
    // nothing ticked. Without one it is plain Select all / clear all.
    const next = allVisibleChecked ? new Set<string>() : new Set(visible.map((o) => o.value));
    onChange(options.every((o) => next.has(o.value)) ? null : next);
  }

  return (
    <span ref={wrapperRef} className="relative inline-flex normal-case">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Filter ${title}${filtered ? " (filtered)" : ""}`}
        aria-expanded={open}
        aria-controls={open ? `${uid}-filter` : undefined}
        className={`inline-grid h-5 w-5 place-items-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
          filtered ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        }`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3" fill="currentColor">
          <path d="M1.5 2h13a.5.5 0 0 1 .4.8L10 9v4.5a.5.5 0 0 1-.8.4l-2-1.5a.5.5 0 0 1-.2-.4V9L1.1 2.8A.5.5 0 0 1 1.5 2Z" />
        </svg>
      </button>
      {open && (
        <div
          id={`${uid}-filter`}
          role="dialog"
          aria-label={`Filter ${title}`}
          className="absolute start-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 text-start text-xs font-normal text-slate-700 shadow-xl"
        >
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search values…"
            aria-label={`Search ${title} values`}
            className="mb-1.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
          <label className="flex items-center gap-2 border-b border-slate-100 px-1 py-1 font-semibold">
            <input type="checkbox" checked={visible.length > 0 && allVisibleChecked} onChange={toggleAllVisible} />
            Select all{search.trim() ? " shown" : ""}
          </label>
          <div className="max-h-60 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="px-1 py-1 text-slate-500">No values match.</p>
            ) : (
              visible.map((o) => (
                <label key={o.value} className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
                  <input type="checkbox" checked={isChecked(o.value)} onChange={() => toggle(o.value)} className="mt-0.5" />
                  <span className="min-w-0 break-words">{o.label}</span>
                </label>
              ))
            )}
          </div>
          {filtered && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Clear this filter
            </button>
          )}
        </div>
      )}
    </span>
  );
}
