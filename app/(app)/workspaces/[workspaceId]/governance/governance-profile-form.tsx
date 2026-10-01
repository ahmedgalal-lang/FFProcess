"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { setGovernanceProfile } from "@/lib/actions/governance";
import { SectionGuide } from "./section-guide";
import { useMessages } from "@/lib/i18n/client";

const COMPANY_SIZES = [
  "Early-stage startup",
  "Growth-stage",
  "Mid-market",
  "Public corporation",
] as const;

/**
 * Company size and jurisdiction, alongside the industry the workspace
 * already records (FR-001). Grounds every assessment — generateGovernanceAssessment
 * refuses to run without all three set (FR-003), so this form is where that
 * gap is closed.
 */
export function GovernanceProfileForm({
  workspaceId,
  industry,
  companySize: initialCompanySize,
  jurisdiction: initialJurisdiction,
}: {
  workspaceId: string;
  industry: string | null;
  companySize: string | null;
  jurisdiction: string | null;
}) {
  const canEdit = useCanEdit();
  const m = useMessages();
  const t = m.governance.profile;
  const [companySize, setCompanySize] = useState(initialCompanySize ?? COMPANY_SIZES[0]);
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction ?? "");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setGovernanceProfile({ workspaceId, companySize, jurisdiction });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? m.common.couldNotSave) : result.error);
        return;
      }
      setDirty(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-bold text-slate-900">{t.title}</h2>
        <SectionGuide id="profile" />
      </div>
      <p className="mb-3 text-xs text-slate-500">
        {t.intro}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t.companySize}
          <select
            value={companySize}
            disabled={!canEdit}
            onChange={(e) => {
              setCompanySize(e.target.value);
              setDirty(true);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
          >
            {COMPANY_SIZES.map((size) => (
              <option key={size} value={size}>
                {t.sizes[size] ?? size}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t.jurisdiction}
          <input
            type="text"
            value={jurisdiction}
            disabled={!canEdit}
            placeholder={t.jurisdictionPlaceholder}
            onChange={(e) => {
              setJurisdiction(e.target.value);
              setDirty(true);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
          />
        </label>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
          <span className="font-mono text-[10px] font-bold text-slate-600">{t.industry}</span>
          {industry ?? <span className="italic text-slate-600">{t.industryNotSet}</span>}
        </span>
      </div>
      {canEdit && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty || !jurisdiction.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {pending ? m.common.saving : t.save}
          </button>
          {error && <span className="text-xs font-medium text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
