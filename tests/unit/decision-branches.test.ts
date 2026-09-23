import { describe, expect, it } from "vitest";
import {
  reconcileBranchDrafts,
  type BranchDraft,
  type ExistingBranchConnection,
} from "@/lib/domain/decision-branches";

/**
 * The one piece of real logic the decision branch editor adds (spec 014,
 * research.md Decision 4): diffing what a consultant has staged in the
 * branch editor against a Decision step's already-stored outgoing
 * connections, into the create/delete operations that apply it. No
 * in-place "update" exists — a changed label or destination is a delete of
 * the old connection plus a create of the new one, because there is no
 * updateStepConnection action (research.md Decision 1) and recreating a
 * connection costs nothing since its id is referenced nowhere else.
 */

function existingConn(overrides: Partial<ExistingBranchConnection> = {}): ExistingBranchConnection {
  return { id: "conn-1", toStepId: "step-yes", label: "Yes", ...overrides };
}

describe("reconcileBranchDrafts", () => {
  it("is a no-op for a staged box that still matches its existing connection exactly", () => {
    const existing = [existingConn()];
    const staged: BranchDraft[] = [
      { connectionId: "conn-1", label: "Yes", destination: { kind: "existing", stepId: "step-yes" } },
    ];
    expect(reconcileBranchDrafts(existing, staged)).toEqual([]);
  });

  it("deletes and recreates when a matched box's label changed but its destination didn't", () => {
    const existing = [existingConn({ label: "Yes" })];
    const staged: BranchDraft[] = [
      { connectionId: "conn-1", label: "Approved", destination: { kind: "existing", stepId: "step-yes" } },
    ];
    expect(reconcileBranchDrafts(existing, staged)).toEqual([
      { kind: "delete", connectionId: "conn-1" },
      { kind: "createToExisting", label: "Approved", toStepId: "step-yes" },
    ]);
  });

  it("deletes and recreates when a matched box's destination changed to a different existing step", () => {
    const existing = [existingConn({ toStepId: "step-old" })];
    const staged: BranchDraft[] = [
      { connectionId: "conn-1", label: "Yes", destination: { kind: "existing", stepId: "step-new" } },
    ];
    expect(reconcileBranchDrafts(existing, staged)).toEqual([
      { kind: "delete", connectionId: "conn-1" },
      { kind: "createToExisting", label: "Yes", toStepId: "step-new" },
    ]);
  });

  it("deletes and recreates when a matched box's destination changed to a brand-new step", () => {
    const existing = [existingConn()];
    const staged: BranchDraft[] = [
      { connectionId: "conn-1", label: "Yes", destination: { kind: "new", label: "Escalate to CFO" } },
    ];
    expect(reconcileBranchDrafts(existing, staged)).toEqual([
      { kind: "delete", connectionId: "conn-1" },
      { kind: "createNewStep", label: "Yes", newStepLabel: "Escalate to CFO" },
    ]);
  });

  it("creates for a staged box with no existing connection behind it, targeting an existing step", () => {
    const staged: BranchDraft[] = [
      { connectionId: null, label: "No", destination: { kind: "existing", stepId: "step-earlier" } },
    ];
    expect(reconcileBranchDrafts([], staged)).toEqual([
      { kind: "createToExisting", label: "No", toStepId: "step-earlier" },
    ]);
  });

  it("creates for a staged box with no existing connection behind it, targeting a brand-new step", () => {
    const staged: BranchDraft[] = [
      { connectionId: null, label: "No", destination: { kind: "new", label: "Reject and notify" } },
    ];
    expect(reconcileBranchDrafts([], staged)).toEqual([
      { kind: "createNewStep", label: "No", newStepLabel: "Reject and notify" },
    ]);
  });

  it("does nothing for an unfilled box that was never connected (FR-008)", () => {
    const staged: BranchDraft[] = [{ connectionId: null, label: "No", destination: { kind: "unset" } }];
    expect(reconcileBranchDrafts([], staged)).toEqual([]);
  });

  it("deletes a matched box that was cleared back to unset — removing a branch (FR-011)", () => {
    const existing = [existingConn()];
    const staged: BranchDraft[] = [{ connectionId: "conn-1", label: "Yes", destination: { kind: "unset" } }];
    expect(reconcileBranchDrafts(existing, staged)).toEqual([{ kind: "delete", connectionId: "conn-1" }]);
  });

  it("deletes an existing connection whose box was removed from the editor entirely", () => {
    // The editor's own "remove this branch" control might drop the box from
    // the staged array outright rather than setting it to unset — both must
    // be treated as the consultant removing that branch.
    const existing = [existingConn({ id: "conn-1" }), existingConn({ id: "conn-2", toStepId: "step-no" })];
    const staged: BranchDraft[] = [
      { connectionId: "conn-1", label: "Yes", destination: { kind: "existing", stepId: "step-yes" } },
    ];
    expect(reconcileBranchDrafts(existing, staged)).toEqual([{ kind: "delete", connectionId: "conn-2" }]);
  });

  it("keeps two staged boxes pointed at the same destination as two independent creates (spec Edge Cases)", () => {
    const staged: BranchDraft[] = [
      { connectionId: null, label: "Yes", destination: { kind: "existing", stepId: "step-next" } },
      { connectionId: null, label: "No", destination: { kind: "existing", stepId: "step-next" } },
    ];
    expect(reconcileBranchDrafts([], staged)).toEqual([
      { kind: "createToExisting", label: "Yes", toStepId: "step-next" },
      { kind: "createToExisting", label: "No", toStepId: "step-next" },
    ]);
  });

  it("treats a branch targeting the Decision step itself like any other destination (research.md Decision 5)", () => {
    const staged: BranchDraft[] = [
      { connectionId: null, label: "No", destination: { kind: "existing", stepId: "step-decision-itself" } },
    ];
    expect(reconcileBranchDrafts([], staged)).toEqual([
      { kind: "createToExisting", label: "No", toStepId: "step-decision-itself" },
    ]);
  });

  it("gives the same result regardless of the order existing connections are passed in", () => {
    const existing = [
      existingConn({ id: "conn-1", toStepId: "step-yes", label: "Yes" }),
      existingConn({ id: "conn-2", toStepId: "step-no", label: "No" }),
    ];
    const staged: BranchDraft[] = [
      { connectionId: "conn-1", label: "Yes", destination: { kind: "existing", stepId: "step-yes" } },
      { connectionId: "conn-2", label: "No", destination: { kind: "existing", stepId: "step-no" } },
    ];
    expect(reconcileBranchDrafts(existing, staged)).toEqual([]);
    expect(reconcileBranchDrafts([...existing].reverse(), staged)).toEqual([]);
  });
});
