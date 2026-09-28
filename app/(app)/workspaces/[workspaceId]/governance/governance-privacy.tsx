"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit, useWorkspaceAccess } from "../workspace-access";
import {
  addDpia,
  addProcessingActivity,
  approveDpia,
  deleteDpia,
  deleteProcessingActivity,
  linkBreachToActivity,
  unlinkBreachFromActivity,
  updateDpia,
  updateProcessingActivity,
} from "@/lib/actions/privacy";
import { parseList } from "@/lib/domain/privacy";
import { OwnerSelect, ownerValue, parseOwnerValue, type OwnerOptionT } from "./owner-select";

type LawfulBasis = "CONSENT" | "CONTRACT" | "LEGAL_OBLIGATION" | "VITAL_INTERESTS" | "PUBLIC_TASK" | "LEGITIMATE_INTERESTS";
type Residual = "LOW" | "MEDIUM" | "HIGH";

export type DpiaT = {
  id: string;
  risksIdentified: string;
  mitigations: string;
  residualRisk: Residual;
  status: "DRAFT" | "APPROVED";
  approvedByName: string | null;
  approvedAt: string | null; // display label
  priorConsultation: boolean;
};

export type ProcessingActivityT = {
  id: string;
  name: string;
  purpose: string;
  lawfulBasis: LawfulBasis;
  dataSubjectCategories: string[];
  personalDataCategories: string[];
  recipients: string[];
  retentionPeriod: string;
  specialCategory: boolean;
  transferDestination: string | null;
  transferSafeguard: string | null;
  processId: string | null;
  processLabel: string | null;
  ownerRoleId: string | null;
  ownerPersonId: string | null;
  ownerLabel: string | null;
  dpiaRecommended: boolean;
  dpias: DpiaT[];
};

export type BreachT = {
  id: string;
  title: string;
  notificationLabel: string;
  urgent: boolean;
  activityIds: string[];
};

const LAWFUL_BASIS_LABEL: Record<LawfulBasis, string> = {
  CONSENT: "Consent",
  CONTRACT: "Contract",
  LEGAL_OBLIGATION: "Legal obligation",
  VITAL_INTERESTS: "Vital interests",
  PUBLIC_TASK: "Public task",
  LEGITIMATE_INTERESTS: "Legitimate interests",
};
const RESIDUAL_LABEL: Record<Residual, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

const badge = "rounded-full border px-1.5 text-[10px] font-bold";
const warn = `${badge} border-amber-300 bg-amber-50 text-amber-900`;
const field = "rounded border border-slate-300 bg-white px-1.5 py-1";
const heading = "mb-1 font-bold text-slate-700";
const secondaryButton = "rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50";
const primaryButton = "rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300";

type RunFn = (action: () => Promise<{ ok: true } | { ok: false; error: string; message?: string }>, after?: () => void) => void;

function useRun(): [RunFn, boolean, string | null] {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const run: RunFn = (action, after) => {
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
  };
  return [run, pending, error];
}

/**
 * The data privacy register (spec 025): the record of processing activities,
 * their DPIAs, and the personal-data breaches from the incident log linked
 * to the activities they affected. Workspace-wide, below the incident log.
 */
export function GovernancePrivacy({
  workspaceId,
  activities,
  breaches,
  processes,
  roles,
  people,
}: {
  workspaceId: string;
  activities: ProcessingActivityT[];
  breaches: BreachT[];
  processes: OwnerOptionT[];
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
}) {
  const canEdit = useCanEdit();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [run, pending, error] = useRun();

  return (
    <section id="privacy" className="rounded-xl border border-slate-200 bg-white p-5 text-xs">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Data privacy</h2>
          <p className="text-slate-500">
            Processing activities (the Article 30 record), their impact assessments, and personal data breaches from the
            incident log.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-600 hover:bg-indigo-100"
          >
            + Record activity
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <ActivityForm
            submitLabel="Record activity"
            processes={processes}
            roles={roles}
            people={people}
            pending={pending}
            onSubmit={(values) => run(() => addProcessingActivity({ workspaceId, ...values }), () => setAdding(false))}
          />
          {error && <p className="mt-2 font-medium text-red-600">{error}</p>}
        </div>
      )}

      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Processing activities</h3>
      {activities.length === 0 ? (
        <p className="mb-4 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">
          No processing activities recorded.
        </p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {activities.map((activity) => {
            const isOpen = openId === activity.id;
            return (
              <li key={activity.id} data-activity={activity.name} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenId(isOpen ? null : activity.id)}
                    className="text-left font-semibold text-slate-900 hover:text-indigo-700"
                  >
                    {activity.name}
                  </button>
                  <span className="text-slate-600">{LAWFUL_BASIS_LABEL[activity.lawfulBasis]}</span>
                  {activity.specialCategory && <span className={`${badge} border-slate-300 bg-slate-50 text-slate-700`}>Special category</span>}
                  {activity.transferDestination && (
                    <span className={`${badge} border-slate-300 bg-slate-50 text-slate-700`}>Transfer: {activity.transferDestination}</span>
                  )}
                  {activity.dpiaRecommended && <span className={warn}>DPIA recommended</span>}
                  {activity.dpias.some((d) => d.priorConsultation) && <span className={warn}>May need prior consultation</span>}
                </div>
                {isOpen && (
                  <ActivityDetail
                    workspaceId={workspaceId}
                    activity={activity}
                    processes={processes}
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

      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Personal data breaches</h3>
      {breaches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-4 text-center text-slate-500">
          No incident is flagged as a personal data breach.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {breaches.map((breach) => {
            const linked = activities.filter((a) => breach.activityIds.includes(a.id));
            const linkable = activities.filter((a) => !breach.activityIds.includes(a.id));
            return (
              <li key={breach.id} data-breach={breach.title} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{breach.title}</span>
                  <span className={breach.urgent ? "font-semibold text-red-700" : "text-slate-600"}>{breach.notificationLabel}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-600">Affected activities:</span>
                  {linked.length === 0 && <span className="text-slate-500">none linked</span>}
                  {linked.map((a) => (
                    <span key={a.id} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5">
                      {a.name}
                      {canEdit && (
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={`Unlink ${a.name} from ${breach.title}`}
                          onClick={() => run(() => unlinkBreachFromActivity({ workspaceId, activityId: a.id, incidentId: breach.id }))}
                          className="font-bold text-slate-500 hover:text-red-600"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {canEdit && linkable.length > 0 && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const activityId = String(new FormData(e.currentTarget).get("activityId") ?? "");
                        if (activityId) run(() => linkBreachToActivity({ workspaceId, activityId, incidentId: breach.id }));
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <select name="activityId" aria-label={`Activity affected by ${breach.title}`} defaultValue="" className={field}>
                        <option value="">Choose an activity…</option>
                        {linkable.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" disabled={pending} className={secondaryButton}>
                        Link activity
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!adding && error && <p className="mt-2 font-medium text-red-600">{error}</p>}
    </section>
  );
}

type ActivityValues = Omit<Parameters<typeof addProcessingActivity>[0], "workspaceId">;

function ActivityForm({
  activity,
  submitLabel,
  processes,
  roles,
  people,
  pending,
  onSubmit,
}: {
  activity?: ProcessingActivityT;
  submitLabel: string;
  processes: OwnerOptionT[];
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
  pending: boolean;
  onSubmit: (values: ActivityValues) => void;
}) {
  const text = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        onSubmit({
          name: text(data, "name"),
          purpose: text(data, "purpose"),
          lawfulBasis: text(data, "lawfulBasis") as LawfulBasis,
          dataSubjectCategories: parseList(text(data, "dataSubjectCategories")),
          personalDataCategories: parseList(text(data, "personalDataCategories")),
          recipients: parseList(text(data, "recipients")),
          retentionPeriod: text(data, "retentionPeriod"),
          specialCategory: data.get("specialCategory") === "on",
          transferDestination: text(data, "transferDestination") || null,
          transferSafeguard: text(data, "transferSafeguard") || null,
          processId: text(data, "processId") || null,
          ...parseOwnerValue(text(data, "owner")),
        });
      }}
      className="flex flex-col gap-2"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 font-medium text-slate-600">
          Activity name
          <input name="name" required defaultValue={activity?.name} className={`${field} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 font-medium text-slate-600">
          Lawful basis
          <select name="lawfulBasis" defaultValue={activity?.lawfulBasis ?? "CONTRACT"} className={`${field} font-normal`}>
            {Object.entries(LAWFUL_BASIS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 font-medium text-slate-600">
        Purpose
        <textarea name="purpose" required rows={2} defaultValue={activity?.purpose} className={`${field} font-normal`} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 font-medium text-slate-600">
          Data subjects (comma-separated)
          <input name="dataSubjectCategories" defaultValue={activity?.dataSubjectCategories.join(", ")} className={`${field} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 font-medium text-slate-600">
          Personal data (comma-separated)
          <input name="personalDataCategories" defaultValue={activity?.personalDataCategories.join(", ")} className={`${field} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 font-medium text-slate-600">
          Recipients and processors (comma-separated)
          <input name="recipients" defaultValue={activity?.recipients.join(", ")} className={`${field} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 font-medium text-slate-600">
          Retention period
          <input name="retentionPeriod" required defaultValue={activity?.retentionPeriod} className={`${field} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 font-medium text-slate-600">
          Transfer destination (outside the jurisdiction)
          <input name="transferDestination" defaultValue={activity?.transferDestination ?? ""} className={`${field} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 font-medium text-slate-600">
          Transfer safeguard
          <input name="transferSafeguard" defaultValue={activity?.transferSafeguard ?? ""} className={`${field} font-normal`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          <input type="checkbox" name="specialCategory" defaultChecked={activity?.specialCategory} />
          Special-category data (e.g. health, biometrics)
        </label>
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Process
          <select name="processId" defaultValue={activity?.processId ?? ""} className={`${field} max-w-[14rem] font-normal`}>
            <option value="">None</option>
            {processes
              .filter((p) => !p.archived || p.id === activity?.processId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived ? " (archived)" : ""}
                </option>
              ))}
          </select>
        </label>
        <OwnerSelect
          name="owner"
          label="Responsible"
          roles={roles}
          people={people}
          defaultValue={ownerValue(activity?.ownerRoleId ?? null, activity?.ownerPersonId ?? null)}
          className={field}
        />
        <button type="submit" disabled={pending} className={`${primaryButton} ml-auto`}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function ActivityDetail({
  workspaceId,
  activity,
  processes,
  roles,
  people,
  onDeleted,
}: {
  workspaceId: string;
  activity: ProcessingActivityT;
  processes: OwnerOptionT[];
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
  onDeleted: () => void;
}) {
  const canEdit = useCanEdit();
  const isAdmin = useWorkspaceAccess().accessLevel === "ADMIN";
  const [run, pending, error] = useRun();
  const [startingDpia, setStartingDpia] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const list = (items: string[]) => (items.length ? items.join(", ") : "—");

  return (
    <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-3 py-3">
      {canEdit ? (
        <ActivityForm
          activity={activity}
          submitLabel="Save activity"
          processes={processes}
          roles={roles}
          people={people}
          pending={pending}
          onSubmit={(values) => run(() => updateProcessingActivity({ workspaceId, activityId: activity.id, ...values }))}
        />
      ) : (
        <dl className="grid gap-x-4 gap-y-1 text-slate-700 sm:grid-cols-[max-content_1fr]">
          <dt className="font-semibold">Purpose</dt>
          <dd>{activity.purpose}</dd>
          <dt className="font-semibold">Data subjects</dt>
          <dd>{list(activity.dataSubjectCategories)}</dd>
          <dt className="font-semibold">Personal data</dt>
          <dd>{list(activity.personalDataCategories)}</dd>
          <dt className="font-semibold">Recipients</dt>
          <dd>{list(activity.recipients)}</dd>
          <dt className="font-semibold">Retention</dt>
          <dd>{activity.retentionPeriod}</dd>
          {activity.transferDestination && (
            <>
              <dt className="font-semibold">Transfer</dt>
              <dd>
                {activity.transferDestination}
                {activity.transferSafeguard && <> ({activity.transferSafeguard})</>}
              </dd>
            </>
          )}
          <dt className="font-semibold">Process</dt>
          <dd>{activity.processLabel ?? "—"}</dd>
          <dt className="font-semibold">Responsible</dt>
          <dd>{activity.ownerLabel ?? "Unassigned"}</dd>
        </dl>
      )}

      <div>
        <div className={heading}>Impact assessments (DPIA)</div>
        {activity.dpias.length === 0 && <p className="text-slate-500">No DPIA yet.</p>}
        <ul className="flex flex-col gap-2">
          {activity.dpias.map((dpia, index) => (
            <li key={dpia.id} className="rounded border border-slate-200 bg-white p-2">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800">DPIA {index + 1}</span>
                <span
                  className={`${badge} ${dpia.status === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-slate-50 text-slate-700"}`}
                >
                  {dpia.status === "APPROVED" ? "Approved" : "Draft"}
                </span>
                <span className="text-slate-600">Residual risk: {RESIDUAL_LABEL[dpia.residualRisk]}</span>
                {dpia.priorConsultation && <span className={warn}>May need prior consultation</span>}
                {dpia.status === "APPROVED" && dpia.approvedAt && (
                  <span className="text-slate-600">
                    Approved {dpia.approvedAt}
                    {dpia.approvedByName && <> by {dpia.approvedByName}</>}
                  </span>
                )}
              </div>
              {canEdit ? (
                <DpiaForm
                  dpia={dpia}
                  submitLabel="Save DPIA"
                  pending={pending}
                  onSubmit={(values) => run(() => updateDpia({ workspaceId, dpiaId: dpia.id, ...values }))}
                >
                  {isAdmin && dpia.status === "DRAFT" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => approveDpia({ workspaceId, dpiaId: dpia.id }))}
                      className={secondaryButton}
                    >
                      Approve DPIA
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteDpia({ workspaceId, dpiaId: dpia.id }))}
                    className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
                  >
                    Delete DPIA
                  </button>
                </DpiaForm>
              ) : (
                <div className="text-slate-700">
                  <p>
                    <span className="font-semibold">Risks:</span> {dpia.risksIdentified}
                  </p>
                  <p>
                    <span className="font-semibold">Mitigations:</span> {dpia.mitigations}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
        {canEdit &&
          (startingDpia ? (
            <div className="mt-2 rounded border border-slate-200 bg-white p-2">
              <DpiaForm
                submitLabel="Start DPIA"
                pending={pending}
                onSubmit={(values) => run(() => addDpia({ workspaceId, activityId: activity.id, ...values }), () => setStartingDpia(false))}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setStartingDpia(true)} className={`${secondaryButton} mt-2`}>
              + Start DPIA
            </button>
          ))}
      </div>

      {error && <p className="font-medium text-red-600">{error}</p>}

      {canEdit && (
        <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
          {confirmingDelete ? (
            <>
              <span className="text-slate-600">Delete this activity and its DPIAs?</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteProcessingActivity({ workspaceId, activityId: activity.id }), onDeleted)}
                className="rounded bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
              >
                Delete activity
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
              Delete activity…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DpiaForm({
  dpia,
  submitLabel,
  pending,
  onSubmit,
  children,
}: {
  dpia?: DpiaT;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: { risksIdentified: string; mitigations: string; residualRisk: Residual }) => void;
  children?: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        onSubmit({
          risksIdentified: String(data.get("risksIdentified") ?? "").trim(),
          mitigations: String(data.get("mitigations") ?? "").trim(),
          residualRisk: String(data.get("residualRisk")) as Residual,
        });
      }}
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1 font-medium text-slate-600">
        Risks to individuals
        <textarea name="risksIdentified" required rows={2} defaultValue={dpia?.risksIdentified} className={`${field} font-normal`} />
      </label>
      <label className="flex flex-col gap-1 font-medium text-slate-600">
        Mitigations
        <textarea name="mitigations" required rows={2} defaultValue={dpia?.mitigations} className={`${field} font-normal`} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Residual risk
          <select name="residualRisk" defaultValue={dpia?.residualRisk ?? "MEDIUM"} className={field}>
            {Object.entries(RESIDUAL_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={primaryButton}>
          {submitLabel}
        </button>
        {children}
      </div>
    </form>
  );
}
