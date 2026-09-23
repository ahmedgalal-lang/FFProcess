"use client";

import type { BranchDraft, BranchDestination, ExistingBranchConnection } from "@/lib/domain/decision-branches";

type StepOption = { id: string; label: string };

/**
 * The two-(or-more)-box editor a Decision step's Type reveals (spec 014).
 *
 * Purely a staging surface — it never calls a server action itself
 * (research.md Decision 3). The caller (`step-form.tsx` for a brand-new
 * step, `step-list-row.tsx` for an existing one) holds the `BranchDraft[]`
 * in its own state, passes it in, and reconciles it against the step's real
 * outgoing connections on Save/Submit via `reconcileBranchDrafts`.
 */
export function DecisionBranchEditor({
  drafts,
  onChange,
  stepOptions,
}: {
  drafts: BranchDraft[];
  onChange: (drafts: BranchDraft[]) => void;
  /** Every other step in the process — a branch may target any of them, including one that comes earlier (FR-006). */
  stepOptions: StepOption[];
}) {
  function updateAt(index: number, patch: Partial<BranchDraft>) {
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function setKind(index: number, kind: BranchDestination["kind"]) {
    const destination: BranchDestination =
      kind === "existing"
        ? { kind: "existing", stepId: stepOptions[0]?.id ?? "" }
        : kind === "new"
          ? { kind: "new", label: "" }
          : { kind: "unset" };
    updateAt(index, { destination });
  }

  function removeAt(index: number) {
    onChange(drafts.filter((_, i) => i !== index));
  }

  function addBranch() {
    onChange([...drafts, { connectionId: null, label: "", destination: { kind: "unset" } }]);
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <span className="text-xs font-semibold text-amber-900">Branches</span>
      <div className="flex flex-col gap-2">
        {drafts.map((draft, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <input
              value={draft.label}
              onChange={(e) => updateAt(index, { label: e.target.value })}
              placeholder={index === 0 ? "Yes" : index === 1 ? "No" : "Outcome label"}
              aria-label="Branch label"
              className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
            <select
              value={draft.destination.kind}
              onChange={(e) => setKind(index, e.target.value as BranchDestination["kind"])}
              aria-label="Branch leads to"
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="unset">— not set yet —</option>
              <option value="new">Create a new step</option>
              <option value="existing">Link to an existing step</option>
            </select>
            {draft.destination.kind === "new" && (
              <input
                value={draft.destination.label}
                onChange={(e) => updateAt(index, { destination: { kind: "new", label: e.target.value } })}
                placeholder="New step name"
                aria-label="New step name"
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            )}
            {draft.destination.kind === "existing" && (
              <select
                value={draft.destination.stepId}
                onChange={(e) => updateAt(index, { destination: { kind: "existing", stepId: e.target.value } })}
                aria-label="Existing step"
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              >
                {stepOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label="Remove this branch"
              className="ml-auto rounded-md px-1.5 py-1 text-xs font-semibold text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addBranch}
        className="self-start rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
      >
        + Add another outcome
      </button>
    </div>
  );
}

/**
 * Seeds the editor's initial boxes from a step's real outgoing connections
 * (FR-009: an existing connection, whatever its label, opens as an
 * already-filled box), padded with empty boxes up to the default of two
 * (FR-003) — "Yes" and "No" when nothing exists yet, or whichever of the
 * two isn't already taken by an existing connection's label when one does.
 */
export function seedBranchDrafts(existing: ExistingBranchConnection[]): BranchDraft[] {
  const drafts: BranchDraft[] = existing.map((c) => ({
    connectionId: c.id,
    label: c.label ?? "",
    destination: { kind: "existing", stepId: c.toStepId },
  }));

  const usedLabels = new Set(drafts.map((d) => d.label));
  const defaults = ["Yes", "No"];
  while (drafts.length < 2) {
    const label = defaults.find((l) => !usedLabels.has(l)) ?? "";
    usedLabels.add(label);
    drafts.push({ connectionId: null, label, destination: { kind: "unset" } });
  }

  return drafts;
}
