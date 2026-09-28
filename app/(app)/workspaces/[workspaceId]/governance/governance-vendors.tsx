"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { addVendor, deleteVendor, linkVendorRisk, unlinkVendorRisk, updateVendor } from "@/lib/actions/vendors";
import type { ContractState } from "@/lib/domain/vendors";
import { OwnerSelect, ownerValue, parseOwnerValue, type OwnerOptionT } from "./owner-select";

type Criticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type DueDiligence = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type VendorT = {
  id: string;
  name: string;
  service: string;
  criticality: Criticality;
  ownerRoleId: string | null;
  ownerPersonId: string | null;
  ownerLabel: string | null;
  dueDiligenceStatus: DueDiligence;
  lastDueDiligenceOn: string | null; // YYYY-MM-DD
  reviewCycleMonths: number | null;
  nextDueDiligenceOn: string | null; // YYYY-MM-DD
  dueDiligenceOverdue: boolean;
  contractStartOn: string | null; // YYYY-MM-DD
  contractEndOn: string | null; // YYYY-MM-DD
  contractState: ContractState;
  risks: { id: string; title: string }[];
};

const CRITICALITY_LABEL: Record<Criticality, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
const CRITICALITY_STYLE: Record<Criticality, string> = {
  LOW: "border-emerald-200 bg-emerald-50 text-emerald-800",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
  HIGH: "border-red-200 bg-red-50 text-red-700",
  CRITICAL: "border-red-300 bg-red-100 text-red-900",
};
const DUE_DILIGENCE_LABEL: Record<DueDiligence, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

const badge = "rounded-full border px-1.5 text-[10px] font-bold";
const alertBadge = `${badge} border-red-200 bg-red-50 text-red-700`;
const warnBadge = `${badge} border-amber-300 bg-amber-50 text-amber-900`;
const field = "rounded border border-slate-300 bg-white px-1.5 py-1";
const primaryButton = "rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300";
const secondaryButton = "rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50";

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
 * The vendor and third-party register (spec 023): who the client depends on,
 * most critical first, with due-diligence and contract flags, and links to
 * the risks each one carries.
 */
export function GovernanceVendors({
  workspaceId,
  vendors,
  risks,
  roles,
  people,
}: {
  workspaceId: string;
  vendors: VendorT[];
  risks: { id: string; title: string }[];
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
}) {
  const canEdit = useCanEdit();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [run, pending, error] = useRun();

  return (
    <section id="vendors" className="rounded-xl border border-slate-200 bg-white p-5 text-xs">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Vendors &amp; third parties</h2>
          <p className="text-slate-500">Outside parties the client depends on, most critical first, with due diligence and contracts.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-600 hover:bg-indigo-100"
          >
            + Add vendor
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <VendorForm
            submitLabel="Add vendor"
            roles={roles}
            people={people}
            pending={pending}
            onSubmit={(values) => run(() => addVendor({ workspaceId, ...values }), () => setAdding(false))}
          />
          {error && <p className="mt-2 font-medium text-red-600">{error}</p>}
        </div>
      )}

      {vendors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">No vendors recorded.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vendors.map((vendor) => {
            const isOpen = openId === vendor.id;
            return (
              <li key={vendor.id} data-vendor={vendor.name} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenId(isOpen ? null : vendor.id)}
                    className="text-left font-semibold text-slate-900 hover:text-indigo-700"
                  >
                    {vendor.name}
                  </button>
                  <span className={`${badge} ${CRITICALITY_STYLE[vendor.criticality]}`}>{CRITICALITY_LABEL[vendor.criticality]}</span>
                  <span className="text-slate-600">{vendor.service}</span>
                  <span className="text-slate-600">Due diligence: {DUE_DILIGENCE_LABEL[vendor.dueDiligenceStatus]}</span>
                  {vendor.dueDiligenceOverdue && <span className={alertBadge}>Due diligence overdue</span>}
                  {vendor.contractState === "RENEWAL_SOON" && <span className={warnBadge}>Renewal within 60 days</span>}
                  {vendor.contractState === "EXPIRED" && <span className={alertBadge}>Contract expired</span>}
                  {vendor.risks.length > 0 && (
                    <span className="text-slate-600">
                      {vendor.risks.length} linked risk{vendor.risks.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {isOpen && (
                  <VendorDetail
                    workspaceId={workspaceId}
                    vendor={vendor}
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
      {!adding && error && <p className="mt-2 font-medium text-red-600">{error}</p>}
    </section>
  );
}

type VendorValues = Omit<Parameters<typeof addVendor>[0], "workspaceId">;

function VendorForm({
  vendor,
  submitLabel,
  roles,
  people,
  pending,
  onSubmit,
}: {
  vendor?: VendorT;
  submitLabel: string;
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
  pending: boolean;
  onSubmit: (values: VendorValues) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const text = (name: string) => String(data.get(name) ?? "").trim();
        onSubmit({
          name: text("name"),
          service: text("service"),
          criticality: text("criticality") as Criticality,
          dueDiligenceStatus: text("dueDiligenceStatus") as DueDiligence,
          lastDueDiligenceOn: text("lastDueDiligenceOn") || null,
          reviewCycleMonths: text("reviewCycleMonths") ? Number(text("reviewCycleMonths")) : null,
          contractStartOn: text("contractStartOn") || null,
          contractEndOn: text("contractEndOn") || null,
          ...parseOwnerValue(text("owner")),
        });
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Vendor name
          <input name="name" required defaultValue={vendor?.name} className={field} />
        </label>
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Criticality
          <select name="criticality" defaultValue={vendor?.criticality ?? "MEDIUM"} className={field}>
            {Object.entries(CRITICALITY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <OwnerSelect
          name="owner"
          label="Internal owner"
          roles={roles}
          people={people}
          defaultValue={ownerValue(vendor?.ownerRoleId ?? null, vendor?.ownerPersonId ?? null)}
          className={field}
        />
      </div>
      <label className="flex flex-col gap-1 font-medium text-slate-600">
        Service provided
        <input name="service" required defaultValue={vendor?.service} className={`${field} font-normal`} />
      </label>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 font-semibold text-slate-700">Due diligence</legend>
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Status
          <select name="dueDiligenceStatus" defaultValue={vendor?.dueDiligenceStatus ?? "NOT_STARTED"} className={field}>
            {Object.entries(DUE_DILIGENCE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Last completed
          <input type="date" name="lastDueDiligenceOn" defaultValue={vendor?.lastDueDiligenceOn ?? ""} className={field} />
        </label>
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Review every (months)
          <input
            type="number"
            name="reviewCycleMonths"
            min={1}
            max={120}
            defaultValue={vendor?.reviewCycleMonths ?? ""}
            className={`${field} w-20`}
          />
        </label>
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 font-semibold text-slate-700">Contract</legend>
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Starts
          <input type="date" name="contractStartOn" defaultValue={vendor?.contractStartOn ?? ""} className={field} />
        </label>
        <label className="flex items-center gap-1.5 font-medium text-slate-600">
          Ends
          <input type="date" name="contractEndOn" defaultValue={vendor?.contractEndOn ?? ""} className={field} />
        </label>
      </fieldset>
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>
        {submitLabel}
      </button>
    </form>
  );
}

function VendorDetail({
  workspaceId,
  vendor,
  risks,
  roles,
  people,
  onDeleted,
}: {
  workspaceId: string;
  vendor: VendorT;
  risks: { id: string; title: string }[];
  roles: OwnerOptionT[];
  people: OwnerOptionT[];
  onDeleted: () => void;
}) {
  const canEdit = useCanEdit();
  const [run, pending, error] = useRun();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const linkable = risks.filter((r) => !vendor.risks.some((l) => l.id === r.id));

  return (
    <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-slate-700">
        Owner: {vendor.ownerLabel ?? "Unassigned"}
        {vendor.nextDueDiligenceOn && <> · Next due diligence {vendor.nextDueDiligenceOn}</>}
        {vendor.contractEndOn && <> · Contract ends {vendor.contractEndOn}</>}
      </p>

      {canEdit && (
        <VendorForm
          vendor={vendor}
          submitLabel="Save vendor"
          roles={roles}
          people={people}
          pending={pending}
          onSubmit={(values) => run(() => updateVendor({ workspaceId, vendorId: vendor.id, ...values }))}
        />
      )}

      <div>
        <div className="mb-1 font-bold text-slate-700">Related risks</div>
        {vendor.risks.length === 0 ? (
          <p className="text-slate-500">Not linked to any risk on the Risk Register.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {vendor.risks.map((r) => (
              <li key={r.id} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5">
                {r.title}
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => unlinkVendorRisk({ workspaceId, vendorId: vendor.id, riskId: r.id }))}
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
              if (riskId) run(() => linkVendorRisk({ workspaceId, vendorId: vendor.id, riskId }));
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
            <button type="submit" disabled={pending} className={secondaryButton}>
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
              <span className="text-slate-600">Delete this vendor? Linked risks stay on the register.</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteVendor({ workspaceId, vendorId: vendor.id }), onDeleted)}
                className="rounded bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
              >
                Delete vendor
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
              Delete vendor…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
