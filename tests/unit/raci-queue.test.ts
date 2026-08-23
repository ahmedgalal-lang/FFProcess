import { describe, it, expect } from "vitest";
import { partitionRaciQueue, type QueueStep } from "@/lib/domain/raci-queue";

describe("partitionRaciQueue", () => {
  it("puts a step with no linked activity and not skipped into pending", () => {
    const steps: QueueStep[] = [{ id: "s1", type: "TASK", label: "Create PO", raciSkipped: false }];
    const { pending, skipped } = partitionRaciQueue(steps, new Set());
    expect(pending.map((s) => s.id)).toEqual(["s1"]);
    expect(skipped).toEqual([]);
  });

  it("excludes a step that already has a linked Activity, from both lists", () => {
    const steps: QueueStep[] = [{ id: "s1", type: "TASK", label: "Create PO", raciSkipped: false }];
    const { pending, skipped } = partitionRaciQueue(steps, new Set(["s1"]));
    expect(pending).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("puts an explicitly skipped step (with no activity) into skipped", () => {
    const steps: QueueStep[] = [{ id: "s1", type: "START", label: "Start", raciSkipped: true }];
    const { pending, skipped } = partitionRaciQueue(steps, new Set());
    expect(pending).toEqual([]);
    expect(skipped.map((s) => s.id)).toEqual(["s1"]);
  });

  it("an activity link takes precedence over a stale skipped flag", () => {
    // Shouldn't normally happen (assigning clears the flag), but a step that
    // somehow has both should read as handled, not skipped.
    const steps: QueueStep[] = [{ id: "s1", type: "TASK", label: "Create PO", raciSkipped: true }];
    const { pending, skipped } = partitionRaciQueue(steps, new Set(["s1"]));
    expect(pending).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("partitions a realistic mixed set correctly", () => {
    const steps: QueueStep[] = [
      { id: "s1", type: "START", label: "Start", raciSkipped: true },
      { id: "s2", type: "TASK", label: "Create PO", raciSkipped: false },
      { id: "s3", type: "DECISION", label: "Approve?", raciSkipped: false },
      { id: "s4", type: "END", label: "End", raciSkipped: false },
    ];
    const { pending, skipped } = partitionRaciQueue(steps, new Set(["s2"]));
    expect(pending.map((s) => s.id)).toEqual(["s3", "s4"]);
    expect(skipped.map((s) => s.id)).toEqual(["s1"]);
  });

  it("handles an empty step list", () => {
    expect(partitionRaciQueue([], new Set())).toEqual({ pending: [], skipped: [] });
  });
});
