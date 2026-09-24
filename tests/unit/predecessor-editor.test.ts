import { describe, it, expect } from "vitest";
import {
  reconcilePredecessorDrafts,
  type ExistingPredecessorConnection,
  type PredecessorDraft,
} from "@/lib/domain/predecessor-editor";

function existingConn(overrides: Partial<ExistingPredecessorConnection> = {}): ExistingPredecessorConnection {
  return { id: "conn-1", fromStepId: "step-a", label: null, ...overrides };
}

function draft(overrides: Partial<PredecessorDraft> = {}): PredecessorDraft {
  return { connectionId: null, label: "", fromStepId: "", ...overrides };
}

describe("reconcilePredecessorDrafts", () => {
  it("is a no-op when a staged box matches an existing connection's step and label exactly", () => {
    const existing = [existingConn({ id: "conn-1", fromStepId: "step-a", label: "Approved" })];
    const staged = [draft({ connectionId: "conn-1", fromStepId: "step-a", label: "Approved" })];
    expect(reconcilePredecessorDrafts(existing, staged)).toEqual([]);
  });

  it("deletes and recreates when a matched box's fromStepId changes", () => {
    const existing = [existingConn({ id: "conn-1", fromStepId: "step-a", label: "" })];
    const staged = [draft({ connectionId: "conn-1", fromStepId: "step-b", label: "" })];
    expect(reconcilePredecessorDrafts(existing, staged)).toEqual([
      { kind: "delete", connectionId: "conn-1" },
      { kind: "create", fromStepId: "step-b", label: "" },
    ]);
  });

  it("deletes and recreates when a matched box's label changes", () => {
    const existing = [existingConn({ id: "conn-1", fromStepId: "step-a", label: "Old" })];
    const staged = [draft({ connectionId: "conn-1", fromStepId: "step-a", label: "New" })];
    expect(reconcilePredecessorDrafts(existing, staged)).toEqual([
      { kind: "delete", connectionId: "conn-1" },
      { kind: "create", fromStepId: "step-a", label: "New" },
    ]);
  });

  it("creates a connection for a box with no matching existing connection", () => {
    const existing: ExistingPredecessorConnection[] = [];
    const staged = [draft({ connectionId: null, fromStepId: "step-a", label: "" })];
    expect(reconcilePredecessorDrafts(existing, staged)).toEqual([
      { kind: "create", fromStepId: "step-a", label: "" },
    ]);
  });

  it("deletes an existing connection with no matching staged box", () => {
    const existing = [existingConn({ id: "conn-1", fromStepId: "step-a" })];
    const staged: PredecessorDraft[] = [];
    expect(reconcilePredecessorDrafts(existing, staged)).toEqual([{ kind: "delete", connectionId: "conn-1" }]);
  });

  it("produces nothing for an unset box (fromStepId === '')", () => {
    const existing: ExistingPredecessorConnection[] = [];
    const staged = [draft({ fromStepId: "" })];
    expect(reconcilePredecessorDrafts(existing, staged)).toEqual([]);
  });

  it("deletes a matched box that was cleared back to unset", () => {
    const existing = [existingConn({ id: "conn-1", fromStepId: "step-a" })];
    const staged = [draft({ connectionId: "conn-1", fromStepId: "" })];
    expect(reconcilePredecessorDrafts(existing, staged)).toEqual([{ kind: "delete", connectionId: "conn-1" }]);
  });

  it("keeps two staged boxes pointing at the same predecessor step as two independent connections", () => {
    const existing: ExistingPredecessorConnection[] = [];
    const staged = [
      draft({ fromStepId: "step-a", label: "First" }),
      draft({ fromStepId: "step-a", label: "Second" }),
    ];
    expect(reconcilePredecessorDrafts(existing, staged)).toEqual([
      { kind: "create", fromStepId: "step-a", label: "First" },
      { kind: "create", fromStepId: "step-a", label: "Second" },
    ]);
  });

  it("reconciles three or more predecessors the same way as two", () => {
    const existing = [
      existingConn({ id: "conn-1", fromStepId: "step-a" }),
      existingConn({ id: "conn-2", fromStepId: "step-b" }),
    ];
    const staged = [
      draft({ connectionId: "conn-1", fromStepId: "step-a" }),
      draft({ connectionId: "conn-2", fromStepId: "step-b" }),
      draft({ connectionId: null, fromStepId: "step-c" }),
    ];
    expect(reconcilePredecessorDrafts(existing, staged)).toEqual([{ kind: "create", fromStepId: "step-c", label: "" }]);
  });

  it("is unaffected by staged/existing order", () => {
    const existing = [
      existingConn({ id: "conn-1", fromStepId: "step-a" }),
      existingConn({ id: "conn-2", fromStepId: "step-b" }),
    ];
    const stagedForward = [
      draft({ connectionId: "conn-1", fromStepId: "step-a" }),
      draft({ connectionId: "conn-2", fromStepId: "step-b" }),
    ];
    const stagedReversed = [
      draft({ connectionId: "conn-2", fromStepId: "step-b" }),
      draft({ connectionId: "conn-1", fromStepId: "step-a" }),
    ];
    expect(reconcilePredecessorDrafts(existing, stagedForward)).toEqual([]);
    expect(reconcilePredecessorDrafts(existing, stagedReversed)).toEqual([]);
  });
});
