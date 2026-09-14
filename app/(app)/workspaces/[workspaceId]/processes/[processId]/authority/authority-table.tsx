"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../../../workspace-access";
import {
  addAuthorityRule,
  deleteAuthorityRule,
  skipAuthorityRow,
  unskipAuthorityRow,
  updateAuthorityRule,
} from "@/lib/actions/authority";
import {
  DIRECTION_LABELS,
  describeAuthorityRule,
  formatMoney,
  requiresApproval,
  type AuthorityDirection,
  type AuthorityIssue,
  type AuthorityRuleData,
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

/** `role:<id>` / `person:<id>`, so one select can offer both. */
function whoKey(rule: AuthorityRuleData): string {
  if (rule.whoRoleId) return `role:${rule.whoRoleId}`;
  if (rule.whoPersonId) return `person:${rule.whoPersonId}`;
  return "";
}

function whoFromKey(key: string): { whoRoleId: string | null; whoPersonId: string | null } {
  if (key.startsWith("role:")) return { whoRoleId: key.slice(5), whoPersonId: null };
  if (key.startsWith("person:")) return { whoRoleId: null, whoPersonId: key.slice(7) };
  return { whoRoleId: null, whoPersonId: null };
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
  const [rows] = useState(initialRows);
  const [issues] = useState(initialIssues);
  const [pending, startTransition] = useTransition();
  const canEdit = useCanEdit();
  const router = useRouter();

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));
  const visibleRows = rows.filter((r) => !r.skipped);
  const skippedRows = rows.filter((r) => r.skipped);
  const flaggedRowIds = new Set(issues.map((i) => i.rowId));
  const flaggedRuleIds = new Set(issues.map((i) => i.ruleId).filter(Boolean) as string[]);

  function whoName(rule: AuthorityRuleData): string | null {
    if (rule.whoRoleId) return roleNameById.get(rule.whoRoleId) ?? null;
    if (rule.whoPersonId) return personNameById.get(rule.whoPersonId) ?? null;
    return null;
  }

  /**
   * Every control saves immediately rather than through a draft-and-save
   * cycle. With one rule per row there is nothing to batch, and the rule
   * sentence underneath is the confirmation.
   */
  function save(rule: AuthorityRuleData, changes: Partial<AuthorityRuleData>) {
    const next = { ...rule, ...changes };
    startTransition(async () => {
      await updateAuthorityRule({
        workspaceId,
        processId,
        ruleId: rule.id,
        rule: {
          measure: next.measure,
          // Cleared here as well as on the server: a money rule must never
          // carry a turnaround, or the reverse (FR-003).
          amount: next.measure === "MONEY" ? next.amount : null,
          days: next.measure === "TIME" ? next.days : null,
          direction: next.measure === "NONE" ? "EQUAL_NO_APPROVAL" : next.direction,
          consequence: next.consequence,
          whoRoleId: next.whoRoleId,
          whoPersonId: next.whoPersonId,
        },
      });
      router.refresh();
    });
  }

  function addRule(row: AuthorityTableRow) {
    startTransition(async () => {
      await addAuthorityRule({ workspaceId, processId, rowId: row.id, kind: row.kind });
      router.refresh();
    });
  }

  function removeRule(ruleId: string) {
    startTransition(async () => {
      await deleteAuthorityRule({ workspaceId, processId, ruleId });
      router.refresh();
    });
  }

  function setSkipped(row: AuthorityTableRow, skipped: boolean) {
    startTransition(async () => {
      const action = skipped ? skipAuthorityRow : unskipAuthorityRow;
      await action({ workspaceId, processId, rowId: row.id, kind: row.kind });
      router.refresh();
    });
  }

  return (
    <div>
      {issues.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          {issues.length} rule{issues.length === 1 ? "" : "s"} still {issues.length === 1 ? "needs" : "need"} finishing
          — give each one a figure and somebody to carry it, or mark the task as needing no approval.
        </div>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm" aria-label="Authority rules by task">
          <caption className="sr-only">
            Each task carries a list of rules. A rule turns on either an amount of money or an elapsed time, and says
            what happens then — the task needs approval, or it escalates. Column titles stay visible while you scroll.
          </caption>
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 bg-slate-50 px-4 py-2">
                Task
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2">
                Turns on
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2">
                Value
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2">
                Direction
              </th>
              <th scope="col" className="sticky top-0 z-20 bg-slate-50 px-3 py-2">
                Then
              </th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row) => (
              <TaskRules
                key={row.id}
                row={row}
                roles={roles}
                people={people}
                canEdit={canEdit}
                pending={pending}
                flagged={flaggedRowIds.has(row.id)}
                flaggedRuleIds={flaggedRuleIds}
                whoName={whoName}
                onSave={save}
                onAdd={() => addRule(row)}
                onRemove={removeRule}
                onSkip={() => setSkipped(row, true)}
              />
            ))}

            {skippedRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 bg-slate-50">
                <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-2 text-left font-medium text-slate-500">
                  <span className="line-through">{row.label}</span>
                </th>
                <td className="px-3 py-2 text-xs text-slate-500" colSpan={4}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span>Skipped — no authority rules apply.</span>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setSkipped(row, false)}
                        aria-label={`Unskip ${row.label}`}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                      >
                        Unskip
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One task and its ordered rules. */
function TaskRules({
  row,
  roles,
  people,
  canEdit,
  pending,
  flagged,
  flaggedRuleIds,
  whoName,
  onSave,
  onAdd,
  onRemove,
  onSkip,
}: {
  row: AuthorityTableRow;
  roles: RoleT[];
  people: PersonT[];
  canEdit: boolean;
  pending: boolean;
  flagged: boolean;
  flaggedRuleIds: Set<string>;
  whoName: (rule: AuthorityRuleData) => string | null;
  onSave: (rule: AuthorityRuleData, changes: Partial<AuthorityRuleData>) => void;
  onAdd: () => void;
  onRemove: (ruleId: string) => void;
  onSkip: () => void;
}) {
  const columns = 5;

  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50/60">
        <th
          scope="row"
          className={`sticky left-0 z-10 bg-slate-50/60 px-4 py-2 text-left font-medium text-slate-900 ${
            flagged ? "border-l-2 border-l-amber-400" : ""
          }`}
        >
          <span className="flex items-center gap-2">
            {row.stepType && (
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                {row.stepType}
              </span>
            )}
            {row.label}
          </span>
        </th>
        <td className="px-3 py-2 text-xs text-slate-500" colSpan={columns - 1}>
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {row.rules.length === 0
                ? "No rules yet."
                : `${row.rules.length} rule${row.rules.length === 1 ? "" : "s"}`}
            </span>
            {canEdit && (
              <span className="inline-flex gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={onAdd}
                aria-label={`Add another rule to ${row.label}`}
                className="whitespace-nowrap rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
              >
                + Add another
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onSkip}
                aria-label={`Skip ${row.label}`}
                className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                Skip
              </button>
              </span>
            )}
          </span>
        </td>
      </tr>

      {row.rules.map((rule) => (
        <RuleRow
          key={rule.id}
          rule={rule}
          roles={roles}
          people={people}
          canEdit={canEdit}
          pending={pending}
          flagged={flaggedRuleIds.has(rule.id)}
          whoName={whoName(rule)}
          columns={columns}
          onSave={onSave}
          onRemove={() => onRemove(rule.id)}
        />
      ))}
    </>
  );
}

function RuleRow({
  rule,
  roles,
  people,
  canEdit,
  pending,
  flagged,
  whoName,
  columns,
  onSave,
  onRemove,
}: {
  rule: AuthorityRuleData;
  roles: RoleT[];
  people: PersonT[];
  canEdit: boolean;
  pending: boolean;
  flagged: boolean;
  whoName: string | null;
  columns: number;
  onSave: (rule: AuthorityRuleData, changes: Partial<AuthorityRuleData>) => void;
  onRemove: () => void;
}) {
  const dimmed = !requiresApproval(rule.direction);

  return (
    <>
      <tr className={`border-t border-slate-100 ${dimmed ? "bg-slate-50" : ""}`}>
        <td className="sticky left-0 z-10 bg-white px-4 py-2" />

        {/* 1 — what the rule turns on */}
        <td className="px-3 py-2">
          {canEdit ? (
            <span className="inline-flex gap-1" role="group" aria-label="What this rule turns on">
              <ToggleButton
                pressed={rule.measure === "MONEY"}
                disabled={pending}
                tone="money"
                onClick={() => onSave(rule, { measure: "MONEY", days: null, direction: nonNullDirection(rule) })}
              >
                Money
              </ToggleButton>
              <ToggleButton
                pressed={rule.measure === "TIME"}
                disabled={pending}
                tone="time"
                onClick={() => onSave(rule, { measure: "TIME", amount: null, direction: nonNullDirection(rule) })}
              >
                Time
              </ToggleButton>
            </span>
          ) : (
            <MeasureChip measure={rule.measure} />
          )}
        </td>

        {/* 2 — the figure */}
        <td className="px-3 py-2">
          {rule.measure === "NONE" ? (
            <span className="text-xs text-slate-500">—</span>
          ) : canEdit ? (
            <FigureInput rule={rule} pending={pending} onSave={onSave} />
          ) : (
            <span className="font-mono text-xs tabular-nums text-slate-700">
              {rule.measure === "MONEY"
                ? rule.amount === null
                  ? "—"
                  : formatMoney(rule.amount)
                : rule.days === null
                  ? "—"
                  : `${rule.days} day${rule.days === 1 ? "" : "s"}`}
            </span>
          )}
        </td>

        {/* 3 — which side of it */}
        <td className="px-3 py-2">
          {canEdit ? (
            <select
              aria-label="Direction"
              value={rule.direction}
              disabled={pending}
              onChange={(e) => {
                const direction = e.target.value as AuthorityDirection;
                onSave(rule, {
                  direction,
                  // "no rule at all" is the one direction that also changes
                  // what the rule turns on.
                  measure: direction === "EQUAL_NO_APPROVAL" ? "NONE" : rule.measure === "NONE" ? "MONEY" : rule.measure,
                });
              }}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            >
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === "EQUAL_NO_APPROVAL" ? "No rule at all" : DIRECTION_LABELS[d].label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-slate-700">
              {rule.direction === "EQUAL_NO_APPROVAL" ? "No rule at all" : DIRECTION_LABELS[rule.direction].label}
            </span>
          )}
        </td>

        {/* 4 — then what, and to whom */}
        <td className="px-3 py-2">
          {rule.measure === "NONE" ? (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">—</span>
              {canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={onRemove}
                  aria-label="Delete this rule"
                  title="Delete this rule"
                  className="rounded-md px-1.5 py-1 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </span>
          ) : canEdit ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex gap-1" role="group" aria-label="What happens">
                <ToggleButton
                  pressed={rule.consequence === "APPROVAL"}
                  disabled={pending}
                  tone="approval"
                  onClick={() => onSave(rule, { consequence: "APPROVAL" })}
                >
                  Needs approval
                </ToggleButton>
                <ToggleButton
                  pressed={rule.consequence === "ESCALATION"}
                  disabled={pending}
                  tone="escalation"
                  onClick={() => onSave(rule, { consequence: "ESCALATION" })}
                >
                  Escalates
                </ToggleButton>
              </span>
              <select
                aria-label={rule.consequence === "APPROVAL" ? "Approver" : "Escalation owner"}
                value={whoKey(rule)}
                disabled={pending}
                onChange={(e) => onSave(rule, whoFromKey(e.target.value))}
                className={`max-w-[9.5rem] rounded-lg border px-2 py-1 text-xs ${
                  flagged ? "border-amber-400 bg-amber-50" : "border-slate-300"
                }`}
              >
                <option value="">— nobody yet —</option>
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
              <button
                type="button"
                disabled={pending}
                onClick={onRemove}
                aria-label="Delete this rule"
                title="Delete this rule"
                className="rounded-md px-1.5 py-1 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                ✕
              </button>
            </span>
          ) : (
            <span className="text-xs text-slate-700">
              {rule.consequence === "APPROVAL" ? "Needs approval" : "Escalates"}
              {whoName ? ` — ${whoName}` : ""}
            </span>
          )}
        </td>

      </tr>

      <tr className="bg-slate-50/40">
        <td className="sticky left-0 z-10 bg-slate-50/40" />
        <td colSpan={columns - 1} className="px-3 pb-2 text-xs text-slate-600">
          <span className="mr-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rule</span>
          {describeAuthorityRule(rule, whoName)}
        </td>
      </tr>
    </>
  );
}

/**
 * Switching away from "no rule at all" has to land on a real direction, or the
 * rule would claim to turn on money while still carrying the direction that
 * means it turns on nothing.
 */
function nonNullDirection(rule: AuthorityRuleData): AuthorityDirection {
  return rule.direction === "EQUAL_NO_APPROVAL" ? "GREATER_THAN" : rule.direction;
}

function FigureInput({
  rule,
  pending,
  onSave,
}: {
  rule: AuthorityRuleData;
  pending: boolean;
  onSave: (rule: AuthorityRuleData, changes: Partial<AuthorityRuleData>) => void;
}) {
  const current = rule.measure === "MONEY" ? rule.amount : rule.days;
  const [text, setText] = useState(current === null ? "" : String(current));

  function commit() {
    const trimmed = text.trim();
    const value = trimmed === "" ? null : Number(trimmed.replace(/,/g, ""));
    if (value !== null && Number.isNaN(value)) return;
    if (rule.measure === "MONEY") onSave(rule, { amount: value });
    else onSave(rule, { days: value === null ? null : Math.round(value) });
  }

  return (
    <span className="inline-flex items-center gap-1">
      {rule.measure === "MONEY" && <span className="font-mono text-xs text-slate-500">$</span>}
      <input
        type="text"
        inputMode="numeric"
        aria-label={rule.measure === "MONEY" ? "Amount" : "Turnaround in days"}
        value={text}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="w-24 rounded-lg border border-slate-300 px-2 py-1 font-mono text-xs tabular-nums"
      />
      {rule.measure === "TIME" && <span className="text-xs text-slate-500">days</span>}
    </span>
  );
}

function MeasureChip({ measure }: { measure: AuthorityRuleData["measure"] }) {
  const style =
    measure === "MONEY"
      ? "bg-emerald-50 text-emerald-700"
      : measure === "TIME"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-500";
  const label = measure === "MONEY" ? "Money" : measure === "TIME" ? "Time" : "None";
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${style}`}>
      {label}
    </span>
  );
}

/**
 * State is carried by border weight and background as well as hue, so the
 * choice is not signalled by colour alone (Constitution Principle IV).
 */
function ToggleButton({
  pressed,
  disabled,
  tone,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled: boolean;
  tone: "money" | "time" | "approval" | "escalation";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = {
    money: "border-emerald-600 bg-emerald-50 text-emerald-800",
    time: "border-amber-600 bg-amber-50 text-amber-800",
    approval: "border-indigo-600 bg-indigo-50 text-indigo-800",
    escalation: "border-rose-600 bg-rose-50 text-rose-800",
  }[tone];

  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-900 ${
        pressed ? `font-bold ${active}` : "border-slate-300 font-medium text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
