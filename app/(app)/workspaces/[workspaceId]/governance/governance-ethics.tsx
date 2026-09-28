"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEthicsCaseNote,
  assignEthicsInvestigator,
  deleteEthicsCase,
  logEthicsCase,
  updateEthicsCaseStatus,
} from "@/lib/actions/ethics";
import type { OwnerOptionT } from "./owner-select";

type Channel = "HOTLINE" | "EMAIL" | "IN_PERSON" | "MANAGER_REFERRAL" | "OTHER";
type Category =
  | "FRAUD"
  | "BRIBERY_CORRUPTION"
  | "HARASSMENT_DISCRIMINATION"
  | "HEALTH_SAFETY"
  | "CONFLICT_OF_INTEREST"
  | "DATA_MISUSE"
  | "OTHER";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Status = "NEW" | "TRIAGED" | "UNDER_INVESTIGATION" | "CLOSED";
type Outcome = "SUBSTANTIATED" | "PARTIALLY_SUBSTANTIATED" | "UNSUBSTANTIATED" | "REFERRED";

export type EthicsCaseT = {
  id: string;
  reference: string;
  receivedOn: string; // YYYY-MM-DD
  channel: Channel;
  category: Category;
  severity: Severity;
  description: string;
  anonymous: boolean;
  reporterName: string | null;
  status: Status;
  investigatorPersonId: string | null;
  investigatorName: string | null;
  outcome: Outcome | null;
  closingSummary: string | null;
  daysOpen: number;
  notes: { id: string; body: string; authorName: string; createdAt: string }[];
};

const CHANNEL_LABEL: Record<Channel, string> = {
  HOTLINE: "Hotline",
  EMAIL: "Email",
  IN_PERSON: "In person",
  MANAGER_REFERRAL: "Manager referral",
  OTHER: "Other",
};
const CATEGORY_LABEL: Record<Category, string> = {
  FRAUD: "Fraud",
  BRIBERY_CORRUPTION: "Bribery & corruption",
  HARASSMENT_DISCRIMINATION: "Harassment & discrimination",
  HEALTH_SAFETY: "Health & safety",
  CONFLICT_OF_INTEREST: "Conflict of interest",
  DATA_MISUSE: "Data misuse",
  OTHER: "Other",
};
const SEVERITY_LABEL: Record<Severity, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
const STATUS_LABEL: Record<Status, string> = {
  NEW: "New",
  TRIAGED: "Triaged",
  UNDER_INVESTIGATION: "Under investigation",
  CLOSED: "Closed",
};
const OUTCOME_LABEL: Record<Outcome, string> = {
  SUBSTANTIATED: "Substantiated",
  PARTIALLY_SUBSTANTIATED: "Partially substantiated",
  UNSUBSTANTIATED: "Unsubstantiated",
  REFERRED: "Referred elsewhere",
};

const field = "rounded border border-slate-300 bg-white px-1.5 py-1";
const primaryButton = "rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300";
const secondaryButton = "rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50";
const OUTSIDE = "__outside__";

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

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as [T, string][]).map(([v, l]) => (
    <option key={v} value={v}>
      {l}
    </option>
  ));

/**
 * The ethics and whistleblower case register (spec 022). Rendered only for
 * Workspace Admins: the page doesn't load cases for anyone else, and every
 * action refuses them.
 */
export function GovernanceEthics({ workspaceId, cases, people }: { workspaceId: string; cases: EthicsCaseT[]; people: OwnerOptionT[] }) {
  const [adding, setAdding] = useState(false);
  const [anonymous, setAnonymous] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [run, pending, error] = useRun();
  const openCount = cases.filter((c) => c.status !== "CLOSED").length;

  return (
    <section id="ethics-cases" className="rounded-xl border border-slate-200 bg-white p-5 text-xs">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Ethics &amp; whistleblower cases</h2>
          <p className="text-slate-500">
            Visible to Workspace Admins only. Not included in reports or the activity log. {openCount} not yet closed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-600 hover:bg-indigo-100"
        >
          + Log case
        </button>
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const text = (name: string) => String(data.get(name) ?? "").trim();
            run(
              () =>
                logEthicsCase({
                  workspaceId,
                  receivedOn: text("receivedOn"),
                  channel: text("channel") as Channel,
                  category: text("category") as Category,
                  severity: text("severity") as Severity,
                  description: text("description"),
                  anonymous,
                  reporterName: anonymous ? null : text("reporterName") || null,
                }),
              () => {
                setAdding(false);
                setAnonymous(true);
              }
            );
          }}
          className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Date received
              <input type="date" name="receivedOn" required className={field} />
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Channel
              <select name="channel" defaultValue="HOTLINE" className={field}>
                {options(CHANNEL_LABEL)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Category
              <select name="category" defaultValue="FRAUD" className={field}>
                {options(CATEGORY_LABEL)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Severity
              <select name="severity" defaultValue="MEDIUM" className={field}>
                {options(SEVERITY_LABEL)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            The concern
            <textarea name="description" required rows={3} className={`${field} font-normal`} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Reporter asked to remain anonymous
            </label>
            {!anonymous && (
              <label className="flex items-center gap-1.5 font-medium text-slate-600">
                Reporter name
                <input name="reporterName" className={field} />
              </label>
            )}
          </div>
          <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>
            Log case
          </button>
        </form>
      )}

      {error && <p className="mb-2 font-medium text-red-600">{error}</p>}

      {cases.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">No cases logged.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cases.map((c) => {
            const isOpen = openId === c.id;
            return (
              <li key={c.id} data-case={c.reference} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenId(isOpen ? null : c.id)}
                    className="font-mono font-semibold text-slate-900 hover:text-indigo-700"
                  >
                    {c.reference}
                  </button>
                  <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-700">{STATUS_LABEL[c.status]}</span>
                  <span className="text-slate-700">{CATEGORY_LABEL[c.category]}</span>
                  <span className="text-slate-600">Severity: {SEVERITY_LABEL[c.severity]}</span>
                  <span className="text-slate-600">{c.anonymous ? "Anonymous" : `Reported by ${c.reporterName ?? "—"}`}</span>
                  <span className="text-slate-600">
                    {c.status === "CLOSED" ? `Closed after ${c.daysOpen} days` : `Open ${c.daysOpen} day${c.daysOpen === 1 ? "" : "s"}`}
                  </span>
                </div>
                {isOpen && <CaseDetail workspaceId={workspaceId} ethicsCase={c} people={people} onDeleted={() => setOpenId(null)} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CaseDetail({
  workspaceId,
  ethicsCase: c,
  people,
  onDeleted,
}: {
  workspaceId: string;
  ethicsCase: EthicsCaseT;
  people: OwnerOptionT[];
  onDeleted: () => void;
}) {
  const [run, pending, error] = useRun();
  const [status, setStatus] = useState<Status>(c.status);
  const [investigator, setInvestigator] = useState(c.investigatorPersonId ?? (c.investigatorName ? OUTSIDE : ""));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-slate-700">
        <p className="whitespace-pre-wrap">{c.description}</p>
        <p className="mt-1 text-slate-600">
          Received {c.receivedOn} by {CHANNEL_LABEL[c.channel].toLowerCase()}
        </p>
        {c.status === "CLOSED" && c.outcome && (
          <p className="mt-1">
            <span className="font-semibold">Outcome:</span> {OUTCOME_LABEL[c.outcome]} — {c.closingSummary}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (status === "NEW") return;
          const data = new FormData(e.currentTarget);
          run(() =>
            updateEthicsCaseStatus({
              workspaceId,
              caseId: c.id,
              status,
              outcome: status === "CLOSED" ? ((String(data.get("outcome") ?? "") || null) as Outcome | null) : null,
              closingSummary: status === "CLOSED" ? String(data.get("closingSummary") ?? "") || null : null,
            })
          );
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 font-medium text-slate-600">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={field}>
              {c.status === "NEW" && (
                <option value="NEW" disabled>
                  New
                </option>
              )}
              <option value="TRIAGED">Triaged</option>
              <option value="UNDER_INVESTIGATION">Under investigation</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>
          {status === "CLOSED" && (
            <label className="flex items-center gap-1.5 font-medium text-slate-600">
              Outcome
              <select name="outcome" required defaultValue={c.outcome ?? ""} className={field}>
                <option value="" disabled>
                  Choose an outcome…
                </option>
                {options(OUTCOME_LABEL)}
              </select>
            </label>
          )}
        </div>
        {status === "CLOSED" && (
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            Closing summary
            <textarea name="closingSummary" required rows={2} defaultValue={c.closingSummary ?? ""} className={`${field} font-normal`} />
          </label>
        )}
        <button type="submit" disabled={pending || (status === c.status && status !== "CLOSED")} className={`${primaryButton} self-start`}>
          Save status
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          run(() =>
            assignEthicsInvestigator({
              workspaceId,
              caseId: c.id,
              investigatorPersonId: investigator && investigator !== OUTSIDE ? investigator : null,
              investigatorName: investigator === OUTSIDE ? String(data.get("investigatorName") ?? "") || null : null,
            })
          );
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Investigator
          <select
            aria-label="Investigator"
            value={investigator}
            onChange={(e) => setInvestigator(e.target.value)}
            className={field}
          >
            <option value="">Not assigned</option>
            {people
              .filter((p) => !p.archived || p.id === c.investigatorPersonId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived ? " (archived)" : ""}
                </option>
              ))}
            <option value={OUTSIDE}>Someone outside the directory…</option>
          </select>
        </label>
        {investigator === OUTSIDE && (
          <label className="flex items-center gap-1.5 font-medium text-slate-600">
            Investigator name
            <input name="investigatorName" required defaultValue={c.investigatorPersonId ? "" : (c.investigatorName ?? "")} className={field} />
          </label>
        )}
        <button type="submit" disabled={pending} className={secondaryButton}>
          Save investigator
        </button>
        {c.investigatorName && <span className="text-slate-600">Currently: {c.investigatorName}</span>}
      </form>

      <div>
        <div className="mb-1 font-bold text-slate-700">Investigation notes</div>
        <p className="mb-1 text-slate-500">Notes are permanent once added.</p>
        {c.notes.length === 0 ? (
          <p className="text-slate-500">No notes yet.</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {c.notes.map((n) => (
              <li key={n.id} className="rounded border border-slate-200 bg-white px-2 py-1.5">
                <div className="text-[10px] text-slate-600">
                  {n.createdAt} · {n.authorName}
                </div>
                <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
              </li>
            ))}
          </ol>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body = String(new FormData(form).get("body") ?? "").trim();
            if (body) run(() => addEthicsCaseNote({ workspaceId, caseId: c.id, body }), () => form.reset());
          }}
          className="mt-2 flex flex-col gap-1.5"
        >
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            New note
            <textarea name="body" required rows={2} className={`${field} font-normal`} />
          </label>
          <button type="submit" disabled={pending} className={`${secondaryButton} self-start`}>
            Add note
          </button>
        </form>
      </div>

      {error && <p className="font-medium text-red-600">{error}</p>}

      {c.status === "NEW" && (
        <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
          {confirmingDelete ? (
            <>
              <span className="text-slate-600">Delete {c.reference}? Its reference won&apos;t be reused.</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteEthicsCase({ workspaceId, caseId: c.id }), onDeleted)}
                className="rounded bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
              >
                Delete case
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
              Delete case… (only while New)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
