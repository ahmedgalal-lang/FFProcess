"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "../workspace-access";
import { createGoverningPolicy, draftGoverningPolicyWithAi, setGoverningPolicy } from "@/lib/actions/governing-policy";
import { rankTemplates } from "@/lib/domain/policy-templates";
import type { PolicyT } from "./governance-policy-drawer";

const LIFECYCLE_LABEL: Record<PolicyT["lifecycleStatus"], string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  RETIRED: "Retired",
};
const LIFECYCLE_STYLE: Record<PolicyT["lifecycleStatus"], string> = {
  DRAFT: "border-slate-300 bg-slate-50 text-slate-700",
  IN_REVIEW: "border-amber-300 bg-amber-50 text-amber-900",
  APPROVED: "border-indigo-200 bg-indigo-50 text-indigo-700",
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  RETIRED: "border-slate-300 bg-slate-100 text-slate-600",
};

type Mode = null | "template" | "write" | "choose";

const field = "rounded border border-slate-300 bg-white px-2 py-1";
const primaryButton = "rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300";
const secondaryButton =
  "rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-500";

/**
 * The one policy that governs the selected aspect (spec 029): its title and
 * lifecycle state, or the ways to give the aspect one. Everything else about
 * the policy (editing, review, approval, acknowledgement) happens in the
 * policy drawer, exactly as for any other policy.
 */
export function GoverningPolicyPanel({
  workspaceId,
  aspect,
  policy,
  candidates,
  hasProfile,
  onOpen,
}: {
  workspaceId: string;
  aspect: { id: string; name: string };
  policy: PolicyT | null;
  /** Library policies not governing any aspect, which can be chosen for this one. */
  candidates: PolicyT[];
  hasProfile: boolean;
  onOpen: (policyId: string) => void;
}) {
  const canEdit = useCanEdit();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ranked = rankTemplates(aspect.name);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string; message?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(
          result.error === "VALIDATION_ERROR" || result.error === "AI_UNAVAILABLE"
            ? (result.message ?? "Could not save.")
            : "Could not save."
        );
        return;
      }
      setMode(null);
      setConfirmingRemove(false);
      after?.();
      router.refresh();
    });
  }

  const idBase = `governing-${aspect.id}`;

  return (
    <section id="governing-policy" aria-labelledby={`${idBase}-heading`} className="rounded-xl border border-slate-200 bg-white p-5 text-xs">
      <h2 id={`${idBase}-heading`} className="text-sm font-bold text-slate-900">
        Governing policy — {aspect.name}
      </h2>
      <p className="mb-3 text-slate-500">The one policy that sets the rules for this aspect as a whole.</p>

      {policy ? (
        <div className="flex flex-wrap items-center gap-2" data-governing-policy={policy.title}>
          <button
            type="button"
            onClick={() => onOpen(policy.id)}
            className="text-left text-sm font-semibold text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:decoration-indigo-600"
          >
            {policy.title}
          </button>
          <span className={`rounded-full border px-2 text-[10px] font-bold ${LIFECYCLE_STYLE[policy.lifecycleStatus]}`}>
            {LIFECYCLE_LABEL[policy.lifecycleStatus]}
          </span>
          {policy.effectiveDate && <span className="text-slate-600">Effective {policy.effectiveDate}</span>}
          {policy.lifecycleStatus !== "PUBLISHED" && (
            <span className="text-slate-600">
              {policy.lifecycleStatus === "RETIRED"
                ? "Retired: publish a replacement to govern this aspect again."
                : "Not yet published: open it to submit, approve and publish."}
            </span>
          )}
          {canEdit && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {candidates.length > 0 && (
                <button type="button" onClick={() => setMode(mode === "choose" ? null : "choose")} aria-expanded={mode === "choose"} className={secondaryButton}>
                  Change
                </button>
              )}
              {confirmingRemove ? (
                <>
                  <span className="text-slate-600">Stop using it as the governing policy? It stays in the library.</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setGoverningPolicy({ workspaceId, aspectId: aspect.id, policyId: null }))}
                    className="rounded bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-600"
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmingRemove(true)} className="text-[11px] font-semibold text-slate-500 hover:text-red-600">
                  Remove as governing policy…
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 font-medium text-amber-900">
            {aspect.name} has no governing policy yet.
          </p>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setMode(mode === "template" ? null : "template")} aria-expanded={mode === "template"} className={secondaryButton}>
                Start from template
              </button>
              <button
                type="button"
                disabled={pending || !hasProfile}
                onClick={() => run(() => draftGoverningPolicyWithAi({ workspaceId, aspectId: aspect.id }))}
                className={secondaryButton}
              >
                {pending ? "Working…" : "Draft with AI"}
              </button>
              <button type="button" onClick={() => setMode(mode === "write" ? null : "write")} aria-expanded={mode === "write"} className={secondaryButton}>
                Write one
              </button>
              {candidates.length > 0 && (
                <button type="button" onClick={() => setMode(mode === "choose" ? null : "choose")} aria-expanded={mode === "choose"} className={secondaryButton}>
                  Choose from library
                </button>
              )}
              {!hasProfile && <span className="text-slate-600">Drafting with AI needs the governance profile above.</span>}
            </div>
          )}
        </div>
      )}

      {mode === "template" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const templateId = String(new FormData(e.currentTarget).get("templateId") ?? "");
            if (templateId) run(() => createGoverningPolicy({ workspaceId, aspectId: aspect.id, templateId }));
          }}
          className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-semibold text-slate-700">Choose a template</legend>
            <div className="grid max-h-72 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
              {ranked.map(({ template, suggested }, i) => (
                <label
                  key={template.id}
                  className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50"
                >
                  <input type="radio" name="templateId" value={template.id} defaultChecked={i === 0} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-900">{template.title}</span>{" "}
                    {suggested && (
                      <span className="ml-1.5 rounded-full bg-indigo-600 px-1.5 text-[9px] font-bold text-white">Suggested</span>
                    )}
                    <span className="sr-only">. </span>
                    <span className="block text-slate-600">{template.purpose}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-slate-600">A template is a starting point to adapt to the client, not legal advice.</p>
          <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>
            Use template
          </button>
        </form>
      )}

      {mode === "write" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(() =>
              createGoverningPolicy({
                workspaceId,
                aspectId: aspect.id,
                title: String(data.get("title") ?? ""),
                body: String(data.get("body") ?? ""),
              })
            );
          }}
          className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            Policy title
            <input name="title" required defaultValue={`${aspect.name} Policy`} className={`${field} font-normal`} />
          </label>
          <label className="flex flex-col gap-1 font-medium text-slate-600">
            Policy text
            <textarea name="body" required rows={6} className={`${field} font-normal`} />
          </label>
          <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>
            Create governing policy
          </button>
        </form>
      )}

      {mode === "choose" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const policyId = String(new FormData(e.currentTarget).get("policyId") ?? "");
            if (policyId) run(() => setGoverningPolicy({ workspaceId, aspectId: aspect.id, policyId }));
          }}
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <label className="flex items-center gap-1.5 font-medium text-slate-600">
            Policy from the library
            <select name="policyId" required defaultValue="" className={`${field} max-w-[22rem] font-normal`}>
              <option value="" disabled>
                Choose a policy…
              </option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({LIFECYCLE_LABEL[p.lifecycleStatus]})
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pending} className={primaryButton}>
            Set as governing policy
          </button>
        </form>
      )}

      {error && <p className="mt-2 font-medium text-red-600">{error}</p>}
    </section>
  );
}
