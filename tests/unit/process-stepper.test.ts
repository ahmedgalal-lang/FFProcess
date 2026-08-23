import { describe, it, expect } from "vitest";
import { computeProcessStepper } from "@/lib/domain/process-stepper";

describe("computeProcessStepper", () => {
  it("flags Process Map as NEXT for a brand-new process", () => {
    const items = computeProcessStepper({ stepsCount: 0, activitiesCount: 0, raciStatus: "DRAFT" });
    expect(items.map((i) => i.status)).toEqual(["done", "current", "upcoming", "optional"]);
    expect(items[1]!.sub).toBe("Add the first step");
    expect(items[2]!.sub).toBe("Map the steps first");
  });

  it("flags RACI Matrix as NEXT once steps exist but RACI hasn't started", () => {
    const items = computeProcessStepper({ stepsCount: 9, activitiesCount: 0, raciStatus: "DRAFT" });
    expect(items.map((i) => i.status)).toEqual(["done", "done", "current", "optional"]);
    expect(items[1]!.sub).toBe("9 steps added");
    expect(items[2]!.sub).toBe("Assign responsibility per step");
  });

  it("shows in-progress RACI activity count while still a draft", () => {
    const items = computeProcessStepper({ stepsCount: 9, activitiesCount: 3, raciStatus: "DRAFT" });
    expect(items[2]!.status).toBe("current");
    expect(items[2]!.sub).toBe("3 activities assigned");
  });

  it("marks Map and RACI both done once RACI is finalized", () => {
    const items = computeProcessStepper({ stepsCount: 9, activitiesCount: 9, raciStatus: "FINAL" });
    expect(items.map((i) => i.status)).toEqual(["done", "done", "done", "optional"]);
    expect(items[2]!.sub).toBe("Finalized");
  });

  it("AI Review is always optional, never done or current", () => {
    const emptyReview = computeProcessStepper({ stepsCount: 0, activitiesCount: 0, raciStatus: "DRAFT" });
    const doneReview = computeProcessStepper({ stepsCount: 9, activitiesCount: 9, raciStatus: "FINAL" });
    expect(emptyReview[3]!.status).toBe("optional");
    expect(doneReview[3]!.status).toBe("optional");
  });

  it("singularizes step/activity counts of exactly 1", () => {
    const items = computeProcessStepper({ stepsCount: 1, activitiesCount: 1, raciStatus: "DRAFT" });
    expect(items[1]!.sub).toBe("1 step added");
    expect(items[2]!.sub).toBe("1 activity assigned");
  });
});
