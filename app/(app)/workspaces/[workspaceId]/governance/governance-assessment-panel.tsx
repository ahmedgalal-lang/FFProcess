"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import {
  generateGovernanceAssessment,
  setChecklistItemStatus,
  addGovernanceChecklistItem,
  updateGovernanceChecklistItem,
  deleteGovernanceChecklistItem,
  updateGovernanceSummary,
  addGovernanceAspect,
  renameGovernanceAspect,
  deleteGovernanceAspect,
} from "@/lib/actions/governance";
import { GovernancePolicyDrawer, type PolicyT } from "./governance-policy-drawer";
import { GovernanceRiskRegister, type RiskT } from "./governance-risk-register";
import { GoverningPolicyPanel } from "./governing-policy-panel";
import { aspectPolicyState } from "@/lib/domain/governing-policy";
import { GovernancePolicyLibrary } from "./governance-policy-library";
import { SectionGuide } from "./section-guide";
import { useMessages } from "@/lib/i18n/client";

export type AspectT = { id: string; name: string };

/**
 * Transparency and Fairness are assessed as one pillar carrying both halves,
 * rather than two that kept producing near-identical findings: disclosure
 * that reaches only some stakeholders is a fairness failure as much as a
 * transparency one. The system prompt frames them the same way.
 */
const PILLARS = [
  "Accountability",
  "Transparency & Fairness",
  "Responsibility",
  "Independence",
] as const;

const PHASE_ORDER = ["IMMEDIATE", "NEAR_TERM", "LONG_TERM"] as const;

export type ChecklistItemT = {
  id: string;
  phase: "IMMEDIATE" | "NEAR_TERM" | "LONG_TERM";
  title: string;
  description: string;
  status: "OPEN" | "EDITED" | "DONE" | "DISMISSED";
  policy: PolicyT | null;
  /** Spec 028 — a role or a person, never both; the label marks an archived owner. */
  ownerRoleId: string | null;
  ownerPersonId: string | null;
  ownerLabel: string | null;
  /** YYYY-MM-DD, or null. */
  dueDate: string | null;
  overdue: boolean;
};

type OwnerOptionT = { id: string; name: string; archived: boolean };

export type AssessmentT = {
  id: string;
  summary: string;
  updatedAtLabel: string;
  items: ChecklistItemT[];
} | null;

/**
 * The AI-assisted governance assessment: profile is set alongside this
 * (governance-profile-form.tsx, sibling in page.tsx), pillars are static,
 * and aspect tabs — a workspace's own, addable/renameable/deletable list
 * (spec 017) — switch which assessment's summary/checklist is shown. The
 * Risk Register and Policy Library are rendered here too, filtered to the
 * same active tab — a risk or policy added by hand (no assessment behind
 * it) has no tab of its own, so it stays visible under every tab rather
 * than becoming unreachable the moment another tab is selected.
 */
export function GovernanceAssessmentPanel({
  workspaceId,
  hasProfile,
  aspects,
  assessmentsByAspectId,
  risks,
  riskLevel = null,
  allPolicies,
  people,
  roles,
}: {
  workspaceId: string;
  hasProfile: boolean;
  aspects: AspectT[];
  assessmentsByAspectId: Record<string, AssessmentT>;
  risks: RiskT[];
  /** From a dashboard tile: show every open risk at this level, across aspects (spec 026). */
  riskLevel?: "HIGH" | "MEDIUM" | "LOW" | null;
  allPolicies: PolicyT[];
  people: OwnerOptionT[];
  roles: OwnerOptionT[];
}) {
  const canEdit = useCanEdit();
  const m = useMessages();
  const t = m.governance.panel;
  // A default aspect name shows translated; one a consultant typed shows as typed.
  const aspectLabel = (name: string) => m.governance.aspectNames[name] ?? name;
  const [aspectId, setAspectId] = useState<string>(aspects[0]?.id ?? "");
  const [openPolicyId, setOpenPolicyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [addingAspect, setAddingAspect] = useState(false);
  const [renamingAspectId, setRenamingAspectId] = useState<string | null>(null);
  const [confirmingDeleteAspectId, setConfirmingDeleteAspectId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const assessment = assessmentsByAspectId[aspectId] ?? null;
  const overdueByAspect: Record<string, number> = Object.fromEntries(
    aspects.map((a) => [a.id, (assessmentsByAspectId[a.id]?.items ?? []).filter((i) => i.overdue).length])
  );
  const focusName = aspects.find((a) => a.id === aspectId)?.name ?? "";
  const focusLabel = aspectLabel(focusName);
  // Spec 029: each aspect's governing policy, and the policies free to become one.
  const governingByAspect = new Map(allPolicies.filter((p) => p.governsAspectId).map((p) => [p.governsAspectId!, p]));
  const ungovernedPolicies = allPolicies.filter((p) => !p.governsAspectId);

  const openPolicy = useMemo(
    () => allPolicies.find((p) => p.id === openPolicyId) ?? null,
    [allPolicies, openPolicyId]
  );

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateGovernanceAssessment({ workspaceId, aspectId });
      if (!result.ok) {
        setError(
          result.error === "AI_UNAVAILABLE" || result.error === "VALIDATION_ERROR"
            ? (result.message ?? t.couldNotGenerate)
            : result.error
        );
        return;
      }
      router.refresh();
    });
  }

  function setItemStatus(itemId: string, status: "OPEN" | "DONE" | "DISMISSED") {
    startTransition(async () => {
      const result = await setChecklistItemStatus({ workspaceId, itemId, status });
      if (result.ok) router.refresh();
    });
  }

  function submitNewAspect(form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await addGovernanceAspect({ workspaceId, name });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? t.couldNotAdd) : result.error);
        return;
      }
      setAddingAspect(false);
      setAspectId(result.data.id);
      router.refresh();
    });
  }

  function submitRenamedAspect(id: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await renameGovernanceAspect({ workspaceId, aspectId: id, name });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? t.couldNotRename) : result.error);
        return;
      }
      setRenamingAspectId(null);
      router.refresh();
    });
  }

  function removeAspect(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteGovernanceAspect({ workspaceId, aspectId: id });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? t.couldNotDelete) : result.error);
        return;
      }
      setConfirmingDeleteAspectId(null);
      // Deleting the aspect currently being viewed moves the view to
      // whatever remains, rather than a tab for something now gone (FR-010).
      if (id === aspectId) {
        const remaining = aspects.filter((a) => a.id !== id);
        setAspectId(remaining[0]?.id ?? "");
      }
      router.refresh();
    });
  }

  function submitNewItem(form: HTMLFormElement) {
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (!title || !description) return;
    setError(null);
    startTransition(async () => {
      const result = await addGovernanceChecklistItem({
        workspaceId,
        aspectId,
        phase: String(data.get("phase") ?? "IMMEDIATE") as "IMMEDIATE" | "NEAR_TERM" | "LONG_TERM",
        title,
        description,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? t.couldNotAdd) : result.error);
        return;
      }
      setAddingItem(false);
      router.refresh();
    });
  }

  function submitEditedItem(itemId: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (!title || !description) return;
    setError(null);
    startTransition(async () => {
      // "role:<id>", "person:<id>", or "" for unassigned — one select, two fields.
      const owner = String(data.get("owner") ?? "");
      const dueDate = String(data.get("dueDate") ?? "");
      const result = await updateGovernanceChecklistItem({
        workspaceId,
        itemId,
        phase: String(data.get("phase") ?? "IMMEDIATE") as "IMMEDIATE" | "NEAR_TERM" | "LONG_TERM",
        title,
        description,
        ownerRoleId: owner.startsWith("role:") ? owner.slice(5) : null,
        ownerPersonId: owner.startsWith("person:") ? owner.slice(7) : null,
        dueDate: dueDate || null,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? m.common.couldNotSave) : result.error);
        return;
      }
      setEditingItemId(null);
      router.refresh();
    });
  }

  function removeItem(itemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteGovernanceChecklistItem({ workspaceId, itemId });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? t.couldNotDelete) : result.error);
        return;
      }
      setConfirmingDeleteId(null);
      router.refresh();
    });
  }

  function saveSummary() {
    if (!assessment) return;
    const summary = summaryDraft.trim();
    if (!summary) return;
    setError(null);
    startTransition(async () => {
      const result = await updateGovernanceSummary({ workspaceId, assessmentId: assessment.id, summary });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? (result.message ?? m.common.couldNotSave) : result.error);
        return;
      }
      setEditingSummary(false);
      router.refresh();
    });
  }

  const grouped = PHASE_ORDER.map((phase) => ({
    phase,
    items: (assessment?.items ?? []).filter((i) => i.phase === phase && i.status !== "DISMISSED"),
  }));

  // Scoped to the active tab — a risk/policy with no source (added by hand)
  // belongs to no tab, so it stays visible everywhere rather than vanishing.
  const risksForTab = risks.filter((r) => r.sourceFocusArea === null || r.sourceFocusArea === aspectId);
  const policiesForTab = allPolicies.filter((p) => p.focusArea === null || p.focusArea === aspectId);

  return (
    <div className="flex flex-col gap-4">
      <section id="governance-assessment" className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="text-sm font-bold text-slate-900">{t.pillarsTitle}</h2>
          <SectionGuide id="assessment" />
        </div>
        <p className="mb-3 text-xs text-slate-500">
          {t.pillarsIntro}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PILLARS.map((pillar) => (
            <div key={pillar} className="rounded-lg border border-slate-200 bg-slate-50 py-2.5 text-center">
              <div className="text-[10.5px] font-bold text-slate-900">{t.pillars[pillar] ?? pillar}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-3" data-testid="aspect-toolbar">
            {/* ARIA requires a tablist's only children be role="tab" elements
                (aria-required-children) — rename/delete/add controls live in
                a separate toolbar below, never nested inside this div. */}
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t.tablistLabel}>
              {aspects.map((aspect) => (
                <button
                  key={aspect.id}
                  type="button"
                  role="tab"
                  aria-selected={aspectId === aspect.id}
                  aria-describedby={
                    aspectPolicyState(governingByAspect.get(aspect.id) ?? null) !== "PUBLISHED"
                      ? `policy-state-${aspect.id}`
                      : undefined
                  }
                  onClick={() => {
                    setAspectId(aspect.id);
                    setAddingItem(false);
                    setEditingItemId(null);
                    setConfirmingDeleteId(null);
                    setEditingSummary(false);
                    setRenamingAspectId(null);
                    setConfirmingDeleteAspectId(null);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    aspectId === aspect.id
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {aspectLabel(aspect.name)}
                  {/* Spec 029: a dot when the aspect lacks a Published governing
                      policy, described rather than named so the tab's name stays
                      its own. */}
                  {aspectPolicyState(governingByAspect.get(aspect.id) ?? null) !== "PUBLISHED" && (
                    <>
                      <span
                        aria-hidden="true"
                        title={t.noPublishedPolicy}
                        className={`ms-1.5 inline-block h-2 w-2 rounded-full align-middle ${
                          aspectId === aspect.id ? "bg-amber-300" : "bg-amber-500"
                        }`}
                      />
                      <span id={`policy-state-${aspect.id}`} hidden>
                        {t.noPublishedPolicy}
                      </span>
                    </>
                  )}
                  {/* Only when there is something overdue, so a tab's
                      accessible name stays just its name otherwise. */}
                  {overdueByAspect[aspect.id] ? (
                    <>
                      {/* Without a separator the name runs into the count:
                          "ESG2 overdue". */}
                      <span className="sr-only">, </span>
                      <span className="ms-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        {t.overdue(overdueByAspect[aspect.id]!)}
                      </span>
                    </>
                  ) : null}
                </button>
              ))}
            </div>
            {canEdit &&
              (addingAspect ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitNewAspect(e.currentTarget);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    name="name"
                    required
                    placeholder={t.aspectName}
                    aria-label={t.aspectName}
                    autoFocus
                    className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button type="submit" disabled={pending} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                    {m.common.add}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingAspect(false)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-600"
                  >
                    {m.common.cancel}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingAspect(true)}
                  className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  {t.addAspect}
                </button>
              ))}
            {canEdit && aspectId ? (
              renamingAspectId === aspectId ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitRenamedAspect(aspectId, e.currentTarget);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    name="name"
                    required
                    defaultValue={focusName}
                    aria-label={t.aspectName}
                    autoFocus
                    className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button type="submit" disabled={pending} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                    {m.common.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingAspectId(null)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-600"
                  >
                    {m.common.cancel}
                  </button>
                </form>
              ) : confirmingDeleteAspectId === aspectId ? (
                <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  {t.deleteAspectConfirm(focusLabel)}
                  <button
                    type="button"
                    onClick={() => removeAspect(aspectId)}
                    disabled={pending}
                    className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
                  >
                    {m.common.delete}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteAspectId(null)}
                    className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {m.common.keep}
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setRenamingAspectId(aspectId)}
                    aria-label={t.renameAspect(focusLabel)}
                    title={t.rename}
                    className="rounded p-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteAspectId(aspectId)}
                    aria-label={t.deleteAspect(focusLabel)}
                    title={m.common.delete}
                    className="rounded p-1 text-[10px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                </span>
              )
            ) : null}
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              {assessment && <span className="text-xs text-slate-500">{t.lastGenerated(assessment.updatedAtLabel)}</span>}
              <button
                type="button"
                onClick={regenerate}
                disabled={pending || !hasProfile}
                title={hasProfile ? undefined : t.profileFirst}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pending ? t.generating : assessment ? t.regenerate : t.generate}
              </button>
            </div>
          )}
        </div>
        {!hasProfile && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            {t.needsProfile}
          </p>
        )}
        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      </section>

      {aspectId && (
        <GoverningPolicyPanel
          key={aspectId}
          workspaceId={workspaceId}
          aspect={{ id: aspectId, name: focusName }}
          policy={governingByAspect.get(aspectId) ?? null}
          candidates={ungovernedPolicies}
          hasProfile={hasProfile}
          onOpen={setOpenPolicyId}
        />
      )}

      {assessment && (assessment.summary.trim() !== "" || canEdit) && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">{t.summaryTitle(focusLabel)}</h2>
            {canEdit && !editingSummary && (
              <button
                type="button"
                onClick={() => {
                  setSummaryDraft(assessment.summary);
                  setError(null);
                  setEditingSummary(true);
                }}
                className="flex-none text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {assessment.summary.trim() ? m.common.edit : t.writeByHand}
              </button>
            )}
          </div>
          {editingSummary ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                rows={6}
                aria-label={t.summaryLabel}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-[13px] leading-relaxed text-slate-800"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveSummary}
                  disabled={pending}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  {pending ? m.common.saving : m.common.save}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSummary(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {m.common.cancel}
                </button>
                {error && <span className="text-xs font-medium text-red-600">{error}</span>}
              </div>
            </div>
          ) : assessment.summary.trim() !== "" ? (
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
              {assessment.summary}
            </p>
          ) : (
            <p className="mt-2 text-[13px] italic text-slate-400">{t.noSummary}</p>
          )}
        </section>
      )}

      {assessment ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-slate-900">{t.checklistTitle}</h2>
              <SectionGuide id="checklist" />
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setAddingItem((v) => !v)}
                className="flex-none rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
              >
                {t.addItem}
              </button>
            )}
          </div>

          {addingItem && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitNewItem(e.currentTarget);
              }}
              className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <input
                name="title"
                required
                placeholder={t.actionTitle}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <textarea
                name="description"
                required
                rows={2}
                placeholder={t.actionPlaceholder}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  {t.when}
                  <select name="phase" defaultValue="IMMEDIATE" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                    <option value="IMMEDIATE">{t.phases.IMMEDIATE}</option>
                    <option value="NEAR_TERM">{t.phases.NEAR_TERM}</option>
                    <option value="LONG_TERM">{t.phases.LONG_TERM}</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="ms-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  {m.common.add}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {grouped.map(({ phase, items }) => (
              <div key={phase}>
                <h3 className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  {t.phases[phase]}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                    {items.length}
                  </span>
                </h3>
                <ul className="flex flex-col gap-2">
                  {items.map((item) =>
                    editingItemId === item.id ? (
                      <li key={item.id} className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitEditedItem(item.id, e.currentTarget);
                          }}
                          className="flex flex-col gap-1.5"
                        >
                          <input
                            name="title"
                            required
                            defaultValue={item.title}
                            aria-label={t.actionTitle}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                          />
                          <textarea
                            name="description"
                            required
                            defaultValue={item.description}
                            rows={2}
                            aria-label={t.actionDescription}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
                          />
                          <div className="flex items-center gap-2">
                            <select
                              name="phase"
                              defaultValue={item.phase}
                              aria-label={t.when}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-[10px]"
                            >
                              <option value="IMMEDIATE">{t.phases.IMMEDIATE}</option>
                              <option value="NEAR_TERM">{t.phases.NEAR_TERM}</option>
                              <option value="LONG_TERM">{t.phases.LONG_TERM}</option>
                            </select>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              name="owner"
                              defaultValue={
                                item.ownerRoleId
                                  ? `role:${item.ownerRoleId}`
                                  : item.ownerPersonId
                                    ? `person:${item.ownerPersonId}`
                                    : ""
                              }
                              aria-label={t.owner}
                              className="min-w-0 max-w-full flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[10px]"
                            >
                              <option value="">{m.common.unassigned}</option>
                              <optgroup label={t.roles}>
                                {roles
                                  .filter((r) => !r.archived || r.id === item.ownerRoleId)
                                  .map((r) => (
                                    <option key={r.id} value={`role:${r.id}`}>
                                      {r.name}
                                      {r.archived ? ` (${m.common.archived})` : ""}
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label={t.people}>
                                {people
                                  .filter((p) => !p.archived || p.id === item.ownerPersonId)
                                  .map((p) => (
                                    <option key={p.id} value={`person:${p.id}`}>
                                      {p.name}
                                      {p.archived ? ` (${m.common.archived})` : ""}
                                    </option>
                                  ))}
                              </optgroup>
                            </select>
                            <input
                              type="date"
                              name="dueDate"
                              defaultValue={item.dueDate ?? ""}
                              aria-label={t.dueDate}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-[10px]"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              disabled={pending}
                              className="ms-auto rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                            >
                              {m.common.save}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingItemId(null)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              {m.common.cancel}
                            </button>
                          </div>
                        </form>
                      </li>
                    ) : (
                      <li
                        key={item.id}
                        className={`rounded-lg border p-2.5 ${item.status === "DONE" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}
                      >
                        <div className="flex items-start gap-2">
                          {canEdit && (
                            <button
                              type="button"
                              aria-pressed={item.status === "DONE"}
                              aria-label={t.markDone}
                              onClick={() => setItemStatus(item.id, item.status === "DONE" ? "OPEN" : "DONE")}
                              className={`mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md border-2 ${
                                item.status === "DONE" ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-white"
                              }`}
                            >
                              {item.status === "DONE" && (
                                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              )}
                            </button>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-semibold ${item.status === "DONE" ? "text-slate-500 line-through" : "text-slate-900"}`}>
                              {item.title}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">{item.description}</div>
                            {(item.ownerLabel || item.dueDate) && (
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-600">
                                {item.ownerLabel && <span>{t.ownerLabel(item.ownerLabel)}</span>}
                                {item.dueDate && <span>{t.due(item.dueDate)}</span>}
                                {item.overdue && (
                                  <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 font-bold uppercase text-red-700">
                                    {t.overdueBadge}
                                  </span>
                                )}
                              </div>
                            )}
                            {item.policy && (
                              <button
                                type="button"
                                onClick={() => setOpenPolicyId(item.policy!.id)}
                                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                              >
                                {t.viewDraftPolicy}
                              </button>
                            )}
                            {canEdit && confirmingDeleteId === item.id && (
                              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-600">
                                {t.deleteItemConfirm}
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  disabled={pending}
                                  className="rounded bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
                                >
                                  {m.common.delete}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDeleteId(null)}
                                  className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  {m.common.keep}
                                </button>
                              </div>
                            )}
                          </div>
                          {canEdit && confirmingDeleteId !== item.id && (
                            <div className="flex flex-none flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingItemId(item.id)}
                                className="text-[10px] font-semibold text-slate-500 hover:text-indigo-600"
                              >
                                {m.common.edit}
                              </button>
                              <button
                                type="button"
                                onClick={() => setItemStatus(item.id, "DISMISSED")}
                                className="text-[10px] font-semibold text-slate-500 hover:text-slate-600"
                              >
                                {t.dismiss}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(item.id)}
                                className="text-[10px] font-semibold text-slate-500 hover:text-red-600"
                              >
                                {m.common.delete}
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  )}
                  {items.length === 0 && (
                    <li className="rounded-lg border border-dashed border-slate-200 px-2.5 py-4 text-center text-[11px] text-slate-500">
                      {t.nothingHere}
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            {t.noAssessment(focusLabel)} {canEdit ? t.noAssessmentEditor : t.noAssessmentViewer}
          </p>
          {canEdit && (
            <div className="mx-auto mt-4 max-w-md text-start">
              {addingItem ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitNewItem(e.currentTarget);
                  }}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <input
                    name="title"
                    required
                    placeholder={t.actionTitle}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                  <textarea
                    name="description"
                    required
                    rows={2}
                    placeholder={t.actionPlaceholder}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      {t.when}
                      <select name="phase" defaultValue="IMMEDIATE" className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                        <option value="IMMEDIATE">{t.phases.IMMEDIATE}</option>
                        <option value="NEAR_TERM">{t.phases.NEAR_TERM}</option>
                        <option value="LONG_TERM">{t.phases.LONG_TERM}</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => setAddingItem(false)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-600"
                    >
                      {m.common.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={pending}
                      className="ms-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                    >
                      {m.common.add}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingItem(true)}
                  className="mx-auto flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
                >
                  {t.addItemByHand}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      <GovernanceRiskRegister
        workspaceId={workspaceId}
        risks={risksForTab}
        allRisks={risks}
        riskLevel={riskLevel}
        roles={roles}
        people={people}
      />
      <GovernancePolicyLibrary workspaceId={workspaceId} policies={policiesForTab} onOpen={setOpenPolicyId} />

      <GovernancePolicyDrawer
        key={openPolicy?.id ?? "none"}
        workspaceId={workspaceId}
        policy={openPolicy}
        people={people}
        onClose={() => setOpenPolicyId(null)}
      />
    </div>
  );
}
