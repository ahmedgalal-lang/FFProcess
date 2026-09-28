"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import {
  addIncident,
  addIncidentAction,
  deleteIncident,
  deleteIncidentAction,
  linkIncidentRisk,
  setIncidentActionDone,
  setIncidentBreach,
  unlinkIncidentRisk,
  updateIncident,
} from "@/lib/actions/incidents";
import { describeBreachState } from "@/lib/domain/incidents";
import { OwnerSelect, parseOwnerValue, type OwnerOptionT } from "./owner-select";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Category = "OPERATIONAL" | "FINANCIAL" | "IT_SECURITY" | "HEALTH_SAFETY" | "COMPLIANCE" | "OTHER";
type Status = "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";

export type IncidentT = {
  id: string;
  title: string;
  description: string;
  occurredAt: string; // YYYY-MM-DD
  severity: Severity;
  category: Category;
  status: Status;
  rootCause: string | null;
  processId: string | null;
  processLabel: string | null;
  daysOpen: number;
  personalDataBreach: boolean;
  breachAwareAt: string | null; // ISO
  regulatorNotifiedAt: string | null; // ISO
  notificationNotRequiredReason: string | null;
  breach: {
    state: "N/A" | "PENDING" | "OVERDUE" | "NOTIFIED" | "NOT_REQUIRED";
    hoursRemaining: number | null;
    deadline: string | null; // ISO
  };
  actions: { id: string; description: string; ownerLabel: string | null; dueDate: string | null; done: boolean; overdue: boolean }[];
  risks: { id: string; title: string }[];
};

type OptionT = OwnerOptionT;

const SEVERITY_LABEL: Record<Severity, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
const SEVERITY_STYLE: Record<Severity, string> = {
  LOW: "border-emerald-200 bg-emerald-50 text-emerald-800",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
  HIGH: "border-red-200 bg-red-50 text-red-700",
  CRITICAL: "border-red-300 bg-red-100 text-red-900",
};
const CATEGORY_LABEL: Record<Category, string> = {
  OPERATIONAL: "Operational",
  FINANCIAL: "Financial",
  IT_SECURITY: "IT & security",
  HEALTH_SAFETY: "Health & safety",
  COMPLIANCE: "Compliance",
  OTHER: "Other",
};
const STATUS_LABEL: Record<Status, string> = {
  OPEN: "Open",
  INVESTIGATING: "Investigating",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const badge = "rounded-full border px-1.5 text-[10px] font-bold";

/** An ISO instant as the value an `<input type="datetime-local">` takes, in the viewer's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

const formatInstant = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The incident log (spec 024): what actually went wrong, workspace-wide and
 * separate from the aspect tabs. Open incidents come first, most severe
 * first; each opens into its status and root cause, corrective actions, the
 * personal-data-breach clock, and links to the risks that materialised.
 */
export function GovernanceIncidents({
  workspaceId,
  incidents,
  processes,
  risks,
  roles,
  people,
}: {
  workspaceId: string;
  incidents: IncidentT[];
  processes: OptionT[];
  risks: { id: string; title: string }[];
  roles: OptionT[];
  people: OptionT[];
}) {
  const canEdit = useCanEdit();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submitNew(form: HTMLFormElement) {
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await addIncident({
        workspaceId,
        title: String(data.get("title") ?? ""),
        description: String(data.get("description") ?? ""),
        occurredAt: String(data.get("occurredAt") ?? ""),
        severity: String(data.get("severity")) as Severity,
        category: String(data.get("category")) as Category,
        processId: String(data.get("processId") ?? "") || null,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not log the incident.") : "Could not log the incident.");
        return;
      }
      setAdding(false);
      router.refresh();
    });
  }

  const openCount = incidents.filter((i) => i.status !== "CLOSED").length;

  return (
    <section id="incidents" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Incidents</h2>
          <p className="text-xs text-slate-500">
            What actually went wrong, followed to a root cause and corrective actions. {openCount} not yet closed.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
          >
            + Log incident
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitNew(e.currentTarget);
          }}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
        >
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            Incident title
            <input name="title" required className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-normal" />
          </label>
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            What happened
            <textarea name="description" required rows={2} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-normal" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Date occurred
              <input type="date" name="occurredAt" required className="rounded border border-slate-300 bg-white px-1.5 py-1" />
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Severity
              <select name="severity" defaultValue="MEDIUM" className="rounded border border-slate-300 bg-white px-1.5 py-1">
                {Object.entries(SEVERITY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Category
              <select name="category" defaultValue="OPERATIONAL" className="rounded border border-slate-300 bg-white px-1.5 py-1">
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Process
              <select name="processId" defaultValue="" className="max-w-[14rem] rounded border border-slate-300 bg-white px-1.5 py-1">
                <option value="">None</option>
                {processes
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={pending}
              className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              Log incident
            </button>
          </div>
          {error && <p className="font-medium text-red-600">{error}</p>}
        </form>
      )}

      {incidents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
          No incidents logged.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {incidents.map((incident) => {
            const isOpen = openId === incident.id;
            const overdueActions = incident.actions.filter((a) => a.overdue).length;
            const breach = describeBreachState(incident.breach);
            return (
              <li key={incident.id} className="rounded-lg border border-slate-200 text-xs" data-incident={incident.title}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenId(isOpen ? null : incident.id)}
                    className="text-left font-semibold text-slate-900 hover:text-indigo-700"
                  >
                    {incident.title}
                  </button>
                  <span className={`${badge} ${SEVERITY_STYLE[incident.severity]}`}>{SEVERITY_LABEL[incident.severity]}</span>
                  <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-700">
                    {STATUS_LABEL[incident.status]}
                  </span>
                  <span className="text-slate-600">{CATEGORY_LABEL[incident.category]}</span>
                  <span className="text-slate-600">
                    {incident.status === "CLOSED"
                      ? `Closed after ${incident.daysOpen} day${incident.daysOpen === 1 ? "" : "s"}`
                      : `Open ${incident.daysOpen} day${incident.daysOpen === 1 ? "" : "s"}`}
                  </span>
                  {overdueActions > 0 && (
                    <span className={`${badge} border-red-200 bg-red-50 text-red-700`}>
                      {overdueActions} overdue action{overdueActions === 1 ? "" : "s"}
                    </span>
                  )}
                  {breach && (
                    <span
                      className={`${badge} ${breach.urgent ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                    >
                      {breach.text}
                    </span>
                  )}
                </div>
                {isOpen && (
                  <IncidentDetail
                    workspaceId={workspaceId}
                    incident={incident}
                    processes={processes}
                    risks={risks}
                    roles={roles}
                    people={people}
                    onDeleted={() => setOpenId(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IncidentDetail({
  workspaceId,
  incident,
  processes,
  risks,
  roles,
  people,
  onDeleted,
}: {
  workspaceId: string;
  incident: IncidentT;
  processes: OptionT[];
  risks: { id: string; title: string }[];
  roles: OptionT[];
  people: OptionT[];
  onDeleted: () => void;
}) {
  const canEdit = useCanEdit();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>(incident.status);
  const [decision, setDecision] = useState<"PENDING" | "NOTIFIED" | "NOT_REQUIRED">(
    incident.regulatorNotifiedAt ? "NOTIFIED" : incident.notificationNotRequiredReason ? "NOT_REQUIRED" : "PENDING"
  );
  const [breachFlag, setBreachFlag] = useState(incident.personalDataBreach);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const router = useRouter();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string; message?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? "Could not save.") : "Could not save.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  const openActions = incident.actions.filter((a) => !a.done).length;
  const breach = describeBreachState(incident.breach);
  const linkable = risks.filter((r) => !incident.risks.some((l) => l.id === r.id));
  const field = "rounded border border-slate-300 bg-white px-1.5 py-1";
  const heading = "mb-1 font-bold text-slate-700";

  return (
    <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-slate-700">
        <p className="whitespace-pre-wrap">{incident.description}</p>
        <p className="mt-1 text-slate-600">
          Occurred {incident.occurredAt}
          {incident.processLabel && <> · Process: {incident.processLabel}</>}
        </p>
      </div>

      {/* Status and root cause */}
      {canEdit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(() =>
              updateIncident({
                workspaceId,
                incidentId: incident.id,
                status,
                rootCause: String(data.get("rootCause") ?? "") || null,
                processId: String(data.get("processId") ?? "") || null,
                severity: String(data.get("severity")) as Severity,
              })
            );
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={field}>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Severity
              <select name="severity" defaultValue={incident.severity} className={field}>
                {Object.entries(SEVERITY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Process
              <select name="processId" defaultValue={incident.processId ?? ""} className={`${field} max-w-[14rem]`}>
                <option value="">None</option>
                {processes
                  .filter((p) => !p.archived || p.id === incident.processId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.archived ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            Root cause
            <textarea name="rootCause" rows={2} defaultValue={incident.rootCause ?? ""} className={`${field} font-normal`} />
          </label>
          {(status === "RESOLVED" || status === "CLOSED") && (
            <p className="text-slate-600">A root cause is required to resolve or close an incident.</p>
          )}
          {status === "CLOSED" && incident.status !== "CLOSED" && openActions > 0 && (
            <p role="alert" className="rounded border border-amber-200 bg-amber-50 px-2 py-1 font-medium text-amber-800">
              {openActions} corrective action{openActions === 1 ? " is" : "s are"} still open. You can still close the
              incident; the actions stay on it.
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            Save incident
          </button>
        </form>
      ) : (
        incident.rootCause && (
          <div>
            <div className={heading}>Root cause</div>
            <p className="whitespace-pre-wrap text-slate-700">{incident.rootCause}</p>
          </div>
        )
      )}

      {/* Corrective actions */}
      <div>
        <div className={heading}>Corrective actions</div>
        {incident.actions.length === 0 ? (
          <p className="text-slate-500">No corrective actions yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {incident.actions.map((a) => (
              <li key={a.id} className="flex items-start gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={a.done}
                    disabled={pending}
                    aria-label={`Done: ${a.description}`}
                    onChange={(e) => run(() => setIncidentActionDone({ workspaceId, actionId: a.id, done: e.target.checked }))}
                    className="mt-0.5"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className={a.done ? "text-slate-500 line-through" : "text-slate-900"}>{a.description}</div>
                  <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-600">
                    <span>Owner: {a.ownerLabel ?? "Unassigned"}</span>
                    {a.dueDate && <span>Due {a.dueDate}</span>}
                    {a.done && <span>Done</span>}
                    {a.overdue && <span className={`${badge} border-red-200 bg-red-50 uppercase text-red-700`}>Overdue</span>}
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteIncidentAction({ workspaceId, actionId: a.id }))}
                    aria-label={`Delete action: ${a.description}`}
                    className="text-[10px] font-semibold text-slate-500 hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              run(
                () =>
                  addIncidentAction({
                    workspaceId,
                    incidentId: incident.id,
                    description: String(data.get("description") ?? ""),
                    ...parseOwnerValue(String(data.get("owner") ?? "")),
                    dueDate: String(data.get("dueDate") ?? "") || null,
                  }),
                () => form.reset()
              );
            }}
            className="mt-2 flex flex-wrap items-center gap-2"
          >
            <input
              name="description"
              required
              aria-label="New corrective action"
              placeholder="What will be changed"
              className={`${field} min-w-[12rem] flex-1`}
            />
            <OwnerSelect name="owner" label="Corrective action owner" roles={roles} people={people} className={field} />
            <input type="date" name="dueDate" aria-label="Corrective action due date" className={field} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              Add corrective action
            </button>
          </form>
        )}
      </div>

      {/* Personal data breach */}
      <div>
        <div className={heading}>Personal data</div>
        {breach && (
          <p className={`mb-1 font-semibold ${breach.urgent ? "text-red-700" : "text-slate-700"}`}>
            {breach.text}
            {incident.breach.state === "NOTIFIED" && incident.regulatorNotifiedAt && <> on {formatInstant(incident.regulatorNotifiedAt)}</>}
            {incident.breach.state === "PENDING" && incident.breach.deadline && <> (deadline {formatInstant(incident.breach.deadline)})</>}
          </p>
        )}
        {incident.breach.state === "NOT_REQUIRED" && incident.notificationNotRequiredReason && (
          <p className="mb-1 text-slate-700">Reason: {incident.notificationNotRequiredReason}</p>
        )}
        {canEdit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              run(() =>
                setIncidentBreach({
                  workspaceId,
                  incidentId: incident.id,
                  personalDataBreach: breachFlag,
                  breachAwareAt: fromLocalInput(String(data.get("breachAwareAt") ?? "")),
                  regulatorNotifiedAt:
                    decision === "NOTIFIED" ? fromLocalInput(String(data.get("regulatorNotifiedAt") ?? "")) : null,
                  notificationNotRequiredReason:
                    decision === "NOT_REQUIRED" ? String(data.get("notificationNotRequiredReason") ?? "") || null : null,
                })
              );
            }}
            className="flex flex-col gap-2"
          >
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              <input type="checkbox" checked={breachFlag} onChange={(e) => setBreachFlag(e.target.checked)} />
              Personal data breach
            </label>
            {breachFlag && (
              <>
                <label className="flex flex-wrap items-center gap-1.5 font-medium text-slate-600">
                  Client became aware at
                  <input
                    type="datetime-local"
                    name="breachAwareAt"
                    defaultValue={toLocalInput(incident.breachAwareAt)}
                    className={field}
                  />
                </label>
                <fieldset className="flex flex-col gap-1">
                  <legend className="font-medium text-slate-600">Regulator notification</legend>
                  {(
                    [
                      ["PENDING", "Not decided yet"],
                      ["NOTIFIED", "Regulator notified"],
                      ["NOT_REQUIRED", "Not required"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-1.5 text-slate-700">
                      <input
                        type="radio"
                        name="decision"
                        value={value}
                        checked={decision === value}
                        onChange={() => setDecision(value)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                {decision === "NOTIFIED" && (
                  <label className="flex flex-wrap items-center gap-1.5 font-medium text-slate-600">
                    Notified at
                    <input
                      type="datetime-local"
                      name="regulatorNotifiedAt"
                      required
                      defaultValue={toLocalInput(incident.regulatorNotifiedAt)}
                      className={field}
                    />
                  </label>
                )}
                {decision === "NOT_REQUIRED" && (
                  <label className="flex flex-col gap-1 font-medium text-slate-600">
                    Why notification isn&apos;t required
                    <textarea
                      name="notificationNotRequiredReason"
                      required
                      rows={2}
                      defaultValue={incident.notificationNotRequiredReason ?? ""}
                      className={`${field} font-normal`}
                    />
                  </label>
                )}
              </>
            )}
            <button
              type="submit"
              disabled={pending}
              className="self-start rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              Save personal data
            </button>
          </form>
        ) : (
          !breach && <p className="text-slate-500">Not a personal data breach.</p>
        )}
      </div>

      {/* Linked risks */}
      <div>
        <div className={heading}>Related risks</div>
        {incident.risks.length === 0 ? (
          <p className="text-slate-500">Not linked to any risk on the Risk Register.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {incident.risks.map((r) => (
              <li key={r.id} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5">
                {r.title}
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => unlinkIncidentRisk({ workspaceId, incidentId: incident.id, riskId: r.id }))}
                    aria-label={`Unlink risk: ${r.title}`}
                    className="font-bold text-slate-500 hover:text-red-600"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && linkable.length > 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const riskId = String(new FormData(e.currentTarget).get("riskId") ?? "");
              if (riskId) run(() => linkIncidentRisk({ workspaceId, incidentId: incident.id, riskId }));
            }}
            className="mt-2 flex flex-wrap items-center gap-2"
          >
            <select name="riskId" aria-label="Risk to link" defaultValue="" className={`${field} max-w-[20rem]`}>
              <option value="">Choose a risk…</option>
              {linkable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              Link risk
            </button>
          </form>
        )}
      </div>

      {error && <p className="font-medium text-red-600">{error}</p>}

      {canEdit && (
        <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
          {confirmingDelete ? (
            <>
              <span className="text-slate-600">Delete this incident and its corrective actions?</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteIncident({ workspaceId, incidentId: incident.id }), onDeleted)}
                className="rounded bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
              >
                Delete incident
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-600"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
            >
              Delete incident…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
