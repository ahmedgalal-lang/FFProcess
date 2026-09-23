/**
 * Reconciling a Decision step's branch editor (spec 014) against what is
 * already stored.
 *
 * A branch is nothing but a StepConnection from a Decision step — there is
 * no dedicated "branch" table, and no updateStepConnection action exists
 * (research.md Decision 1: three existing actions, createStepConnection /
 * deleteStepConnection / addProcessStep, already do everything this needs).
 * So a changed label or a changed destination is not an in-place update; it
 * is a delete of the old connection and a create of the new one — the
 * connection's own id is referenced nowhere else in the schema, so
 * recreating it costs nothing.
 *
 * Framework-free — connections and drafts in, operations out — so it's
 * unit-testable without the database (Constitution Principle III), and the
 * UI layer (decision-branch-editor.tsx, step-form.tsx, step-list-row.tsx)
 * is the only thing that ever turns an operation into a real server call.
 */

/** One of a Decision step's outgoing connections, as already stored. */
export type ExistingBranchConnection = {
  id: string;
  toStepId: string;
  label: string | null;
};

export type BranchDestination =
  | { kind: "existing"; stepId: string }
  | { kind: "new"; label: string }
  /** An empty box — no branch here (yet), and nothing to reconcile for it. */
  | { kind: "unset" };

/**
 * One box in the branch editor, staged client-side. `connectionId` is set
 * when the box was pre-populated from a connection the step already had
 * (FR-009); it is `null` for a box the consultant added in this session.
 */
export type BranchDraft = {
  connectionId: string | null;
  label: string;
  destination: BranchDestination;
};

export type BranchOperation =
  | { kind: "delete"; connectionId: string }
  | { kind: "createToExisting"; label: string; toStepId: string }
  | { kind: "createNewStep"; label: string; newStepLabel: string };

/**
 * Diffs a Decision step's staged branch boxes against its already-stored
 * outgoing connections.
 *
 * Two passes: staged boxes drive most of the result (no-op, delete,
 * delete+create, or a bare create), then any existing connection no staged
 * box referenced at all is a delete — covering an editor that drops a
 * removed box from the staged array outright, not just clearing it to
 * `unset` (both are "the consultant removed this branch").
 */
export function reconcileBranchDrafts(
  existing: ExistingBranchConnection[],
  staged: BranchDraft[]
): BranchOperation[] {
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const referencedIds = new Set<string>();
  const operations: BranchOperation[] = [];

  for (const draft of staged) {
    const matched = draft.connectionId ? existingById.get(draft.connectionId) : undefined;
    if (matched) referencedIds.add(matched.id);

    if (draft.destination.kind === "unset") {
      if (matched) operations.push({ kind: "delete", connectionId: matched.id });
      continue; // never anything to create for an unset box
    }

    if (matched) {
      const unchanged =
        draft.destination.kind === "existing" &&
        draft.destination.stepId === matched.toStepId &&
        draft.label === (matched.label ?? "");
      if (unchanged) continue;
      operations.push({ kind: "delete", connectionId: matched.id });
    }

    operations.push(
      draft.destination.kind === "existing"
        ? { kind: "createToExisting", label: draft.label, toStepId: draft.destination.stepId }
        : { kind: "createNewStep", label: draft.label, newStepLabel: draft.destination.label }
    );
  }

  for (const conn of existing) {
    if (!referencedIds.has(conn.id)) operations.push({ kind: "delete", connectionId: conn.id });
  }

  return operations;
}
