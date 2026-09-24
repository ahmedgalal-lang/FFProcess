"use client";

import type { ExistingPredecessorConnection, PredecessorDraft } from "@/lib/domain/predecessor-editor";

type StepOption = { id: string; label: string };

/**
 * The predecessor editor a step's own row reveals in edit mode (spec 015) —
 * every incoming connection, not just one (FR-001), each addable and
 * removable independently (FR-002/FR-003).
 *
 * Purely a staging surface — it never calls a server action itself, the same
 * shape `DecisionBranchEditor` (spec 014) uses for the outgoing side.
 * `step-list-row.tsx` holds the `PredecessorDraft[]` in its own state, passes
 * it in, and reconciles it against the step's real incoming connections on
 * Save via `reconcilePredecessorDrafts`. Smaller than the Decision branch
 * editor: a predecessor's destination is always an existing step (FR-002) —
 * there is no "create a new step" case here (research.md Decision 4).
 */
export function PredecessorEditor({
  drafts,
  onChange,
  stepOptions,
}: {
  drafts: PredecessorDraft[];
  onChange: (drafts: PredecessorDraft[]) => void;
  /** Every other step in the process — a predecessor may be any of them, including one that comes later (FR-002). */
  stepOptions: StepOption[];
}) {
  function updateAt(index: number, patch: Partial<PredecessorDraft>) {
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function removeAt(index: number) {
    onChange(drafts.filter((_, i) => i !== index));
  }

  function addPredecessor() {
    onChange([...drafts, { connectionId: null, label: "", fromStepId: "" }]);
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <span className="text-xs font-semibold text-slate-700">Predecessors</span>
      <div className="flex flex-col gap-2">
        {drafts.map((draft, index) => (
          <div
            key={index}
            // A distinct border shade from DecisionBranchEditor's own boxes
            // (border-slate-200), not just the same styling reused: a
            // Decision step's edit form renders both editors at once, and
            // tests/e2e/decision-branch-editor.spec.ts scopes its box
            // locators by that exact class combination — an identical class
            // here would silently pull this editor's boxes into its counts.
            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white p-2"
          >
            <select
              value={draft.fromStepId}
              onChange={(e) => updateAt(index, { fromStepId: e.target.value })}
              aria-label="Connects from"
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">— entry point —</option>
              {stepOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              value={draft.label}
              onChange={(e) => updateAt(index, { label: e.target.value })}
              placeholder="Connector label"
              aria-label="Connector label"
              className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label="Remove this predecessor"
              className="ml-auto rounded-md px-1.5 py-1 text-xs font-semibold text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addPredecessor}
        className="self-start rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        + Add predecessor
      </button>
    </div>
  );
}

/**
 * Seeds the editor's initial boxes from a step's real incoming connections
 * (whatever their labels, opened as already-filled boxes). A step with no
 * predecessors yet — an entry point — seeds a single empty box, matching the
 * "— entry point —" affordance the single-select field offered before this
 * feature.
 */
export function seedPredecessorDrafts(existing: ExistingPredecessorConnection[]): PredecessorDraft[] {
  if (existing.length === 0) return [{ connectionId: null, label: "", fromStepId: "" }];

  return existing.map((c) => ({
    connectionId: c.id,
    label: c.label ?? "",
    fromStepId: c.fromStepId,
  }));
}
