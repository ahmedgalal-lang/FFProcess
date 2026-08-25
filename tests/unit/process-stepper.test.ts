import { describe, it, expect } from "vitest";
import { computeProcessStepper } from "@/lib/domain/process-stepper";

describe("computeProcessStepper", () => {
  it("flags Process Map as NEXT for a brand-new process", () => {
    const items = computeProcessStepper({
      stepsCount: 0,
      activitiesCount: 0,
      raciStatus: "DRAFT",
      authorityAssignedCount: 0,
    });
    expect(items.map((i) => i.status)).toEqual(["done", "current", "upcoming", "upcoming", "optional"]);
    expect(items[1]!.sub).toBe("Add the first step");
    expect(items[2]!.sub).toBe("Map the steps first");
    expect(items[3]!.sub).toBe("Finalize RACI first");
  });

  it("flags RACI Matrix as NEXT once steps exist but RACI hasn't started", () => {
    const items = computeProcessStepper({
      stepsCount: 9,
      activitiesCount: 0,
      raciStatus: "DRAFT",
      authorityAssignedCount: 0,
    });
    expect(items.map((i) => i.status)).toEqual(["done", "done", "current", "upcoming", "optional"]);
    expect(items[1]!.sub).toBe("9 steps added");
    expect(items[2]!.sub).toBe("Assign responsibility per step");
  });

  it("shows in-progress RACI activity count while still a draft", () => {
    const items = computeProcessStepper({
      stepsCount: 9,
      activitiesCount: 3,
      raciStatus: "DRAFT",
      authorityAssignedCount: 0,
    });
    expect(items[2]!.status).toBe("current");
    expect(items[2]!.sub).toBe("3 activities assigned");
  });

  it("marks Map and RACI both done, and unlocks Authority Matrix, once RACI is finalized", () => {
    const items = computeProcessStepper({
      stepsCount: 9,
      activitiesCount: 9,
      raciStatus: "FINAL",
      authorityAssignedCount: 0,
    });
    expect(items.map((i) => i.status)).toEqual(["done", "done", "done", "current", "optional"]);
    expect(items[2]!.sub).toBe("Finalized");
    expect(items[3]!.sub).toBe("Set thresholds and approvers per task");
  });

  it("shows in-progress Authority task count once some rows are set", () => {
    const items = computeProcessStepper({
      stepsCount: 9,
      activitiesCount: 9,
      raciStatus: "FINAL",
      authorityAssignedCount: 4,
    });
    expect(items[3]!.status).toBe("current");
    expect(items[3]!.sub).toBe("4 tasks set");
  });

  it("keeps Authority Matrix upcoming while RACI is still a draft, even with steps", () => {
    const items = computeProcessStepper({
      stepsCount: 9,
      activitiesCount: 9,
      raciStatus: "DRAFT",
      authorityAssignedCount: 0,
    });
    expect(items[3]!.status).toBe("upcoming");
  });

  it("AI Review is always optional, never done or current", () => {
    const emptyReview = computeProcessStepper({
      stepsCount: 0,
      activitiesCount: 0,
      raciStatus: "DRAFT",
      authorityAssignedCount: 0,
    });
    const doneReview = computeProcessStepper({
      stepsCount: 9,
      activitiesCount: 9,
      raciStatus: "FINAL",
      authorityAssignedCount: 9,
    });
    expect(emptyReview[4]!.status).toBe("optional");
    expect(doneReview[4]!.status).toBe("optional");
  });

  it("singularizes step/activity/task counts of exactly 1", () => {
    const items = computeProcessStepper({
      stepsCount: 1,
      activitiesCount: 1,
      raciStatus: "FINAL",
      authorityAssignedCount: 1,
    });
    expect(items[1]!.sub).toBe("1 step added");
    expect(items[3]!.sub).toBe("1 task set");
  });
});
