/**
 * Reconciling a step's predecessor editor (spec 015) against what is already
 * stored.
 *
 * A predecessor is nothing but a StepConnection *into* a step — there is no
 * dedicated "predecessor" table, and no updateStepConnection action exists
 * (research.md Decision 2: createStepConnection/deleteStepConnection already
 * do everything this needs, unchanged, called with this step as `toStepId`).
 * So a changed label or a changed source step is not an in-place update; it
 * is a delete of the old connection and a create of the new one.
 *
 * Deliberately smaller than lib/domain/decision-branches.ts (spec 014), which
 * this mirrors: a predecessor's destination is always an existing step
 * (FR-002) — there is no "create a brand-new step" case on the incoming
 * side, so there is no destination-kind union to diff, just a `fromStepId`
 * that is either set or empty (research.md Decision 4).
 *
 * Framework-free — connections and drafts in, operations out — so it's
 * unit-testable without the database (Constitution Principle III), and the
 * UI layer (predecessor-editor.tsx, step-list-row.tsx) is the only thing
 * that ever turns an operation into a real server call.
 */

/** One of a step's incoming connections, as already stored. */
export type ExistingPredecessorConnection = {
  id: string;
  fromStepId: string;
  label: string | null;
};

/**
 * One box in the predecessor editor, staged client-side. `connectionId` is
 * set when the box was pre-populated from a connection the step already had;
 * it is `null` for a box the consultant added in this session. `fromStepId
 * === ""` means an unset box — no predecessor chosen (yet), nothing to
 * reconcile for it.
 */
export type PredecessorDraft = {
  connectionId: string | null;
  label: string;
  fromStepId: string;
};

export type PredecessorOperation =
  | { kind: "delete"; connectionId: string }
  | { kind: "create"; fromStepId: string; label: string };

/**
 * Diffs a step's staged predecessor boxes against its already-stored
 * incoming connections.
 *
 * Two passes: staged boxes drive most of the result (no-op, delete,
 * delete+create, or a bare create), then any existing connection no staged
 * box referenced at all is a delete — covering an editor that drops a
 * removed box from the staged array outright, not just clearing it to
 * unset (both are "the consultant removed this predecessor").
 */
export function reconcilePredecessorDrafts(
  existing: ExistingPredecessorConnection[],
  staged: PredecessorDraft[]
): PredecessorOperation[] {
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const referencedIds = new Set<string>();
  const operations: PredecessorOperation[] = [];

  for (const draft of staged) {
    const matched = draft.connectionId ? existingById.get(draft.connectionId) : undefined;
    if (matched) referencedIds.add(matched.id);

    if (draft.fromStepId === "") {
      if (matched) operations.push({ kind: "delete", connectionId: matched.id });
      continue; // never anything to create for an unset box
    }

    if (matched) {
      const unchanged = draft.fromStepId === matched.fromStepId && draft.label === (matched.label ?? "");
      if (unchanged) continue;
      operations.push({ kind: "delete", connectionId: matched.id });
    }

    operations.push({ kind: "create", fromStepId: draft.fromStepId, label: draft.label });
  }

  for (const conn of existing) {
    if (!referencedIds.has(conn.id)) operations.push({ kind: "delete", connectionId: conn.id });
  }

  return operations;
}
