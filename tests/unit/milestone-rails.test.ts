import { describe, it, expect } from "vitest";
import {
  buildMilestoneRails,
  EMPTY_RAIL_SPACING,
  MIN_BEAD_GAP,
  RAIL_INSET,
  RAIL_SPACING,
  RAIL_WIDTH,
  type RailProcess,
  type RailStep,
} from "@/lib/domain/milestone-rails";

function step(overrides: Partial<RailStep> & { id: string; number: number }): RailStep {
  return {
    label: overrides.id,
    type: "TASK",
    milestone: false,
    linksTo: [],
    branchedBy: [],
    ...overrides,
  };
}

function process(overrides: Partial<RailProcess> & { id: string; code: string }): RailProcess {
  return {
    name: overrides.code,
    stepCount: overrides.steps?.length ?? 0,
    branchFrom: null,
    steps: [],
    ...overrides,
  };
}

describe("buildMilestoneRails", () => {
  it("gives every process a rail, one under the next", () => {
    const layout = buildMilestoneRails([
      process({
        id: "a",
        code: "AAA100",
        stepCount: 1,
        steps: [step({ id: "s1", number: 1, milestone: true })],
      }),
      process({
        id: "b",
        code: "BBB100",
        stepCount: 1,
        steps: [step({ id: "s2", number: 1, milestone: true })],
      }),
    ]);
    expect(layout.rails).toHaveLength(2);
    expect(layout.rails[0]!.y).toBe(0);
    expect(layout.rails[1]!.y).toBe(RAIL_SPACING);
  });

  it("gives a rail with nothing on it much less room than one with beads", () => {
    const layout = buildMilestoneRails([
      process({ id: "a", code: "AAA100", stepCount: 3, steps: [step({ id: "s1", number: 1 })] }),
      process({
        id: "b",
        code: "BBB100",
        stepCount: 1,
        steps: [step({ id: "s2", number: 1, milestone: true })],
      }),
    ]);

    expect(layout.rails[0]!.height).toBe(EMPTY_RAIL_SPACING);
    expect(layout.rails[1]!.height).toBe(RAIL_SPACING);
    expect(layout.rails[1]!.y).toBe(EMPTY_RAIL_SPACING);
    expect(layout.height).toBe(EMPTY_RAIL_SPACING + RAIL_SPACING);
  });

  it("puts a branching process directly under its source, not merely somewhere below", () => {
    // The drop from a bead has to be a short line, so nothing unrelated may sit
    // between a process and the one that picks up from it.
    const layout = buildMilestoneRails([
      process({
        id: "src",
        code: "AAA100",
        stepCount: 1,
        steps: [step({ id: "origin", number: 1, branchedBy: ["ZZZ100"] })],
      }),
      process({ id: "middle", code: "MMM100", stepCount: 1, steps: [step({ id: "m1", number: 1, milestone: true })] }),
      process({
        id: "branch",
        code: "ZZZ100",
        stepCount: 1,
        branchFrom: { processId: "src", stepId: "origin" },
        steps: [step({ id: "z1", number: 1, milestone: true })],
      }),
    ]);

    expect(layout.rails.map((r) => r.code)).toEqual(["AAA100", "ZZZ100", "MMM100"]);
  });

  it("puts a bead on each marked milestone and nothing else", () => {
    const layout = buildMilestoneRails([
      process({
        id: "a",
        code: "NEW100",
        stepCount: 4,
        steps: [
          step({ id: "s1", number: 1 }),
          step({ id: "s2", number: 2, milestone: true, label: "Request logged" }),
          step({ id: "s3", number: 3 }),
          step({ id: "s4", number: 4, milestone: true, label: "Scope agreed" }),
        ],
      }),
    ]);

    expect(layout.rails[0]!.beads.map((b) => b.label)).toEqual(["Request logged", "Scope agreed"]);
    expect(layout.milestoneCount).toBe(2);
  });

  it("shows a step another process branches from even when nobody marked it", () => {
    // The rail has to have somewhere for the branch to attach, so a step that
    // another process depends on earns its bead regardless.
    const layout = buildMilestoneRails([
      process({
        id: "a",
        code: "NEW100",
        stepCount: 3,
        steps: [
          step({ id: "s1", number: 1 }),
          step({ id: "s2", number: 2, label: "CEO approval", branchedBy: ["GEO100"] }),
          step({ id: "s3", number: 3 }),
        ],
      }),
    ]);

    const bead = layout.rails[0]!.beads[0]!;
    expect(bead.label).toBe("CEO approval");
    expect(bead.isMilestone).toBe(false);
    expect(bead.branchedBy).toEqual(["GEO100"]);
  });

  it("shows a step that links out to another process", () => {
    const layout = buildMilestoneRails([
      process({
        id: "a",
        code: "PUR101",
        stepCount: 2,
        steps: [step({ id: "s1", number: 1 }), step({ id: "s2", number: 2, linksTo: ["PUR102"] })],
      }),
    ]);
    expect(layout.rails[0]!.beads).toHaveLength(1);
    expect(layout.rails[0]!.beads[0]!.linksTo).toEqual(["PUR102"]);
  });

  it("marks a rail empty when the process has nothing to show yet", () => {
    const layout = buildMilestoneRails([
      process({ id: "a", code: "NEW100", stepCount: 2, steps: [step({ id: "s1", number: 1 })] }),
    ]);
    expect(layout.rails[0]!.isEmpty).toBe(true);
    expect(layout.rails[0]!.beads).toEqual([]);
  });

  it("places a bead in proportion to where its step falls in the process", () => {
    const layout = buildMilestoneRails([
      process({
        id: "a",
        code: "NEW100",
        stepCount: 11,
        steps: [step({ id: "s6", number: 6, milestone: true })],
      }),
    ]);
    // Step 6 of 11 is exactly halfway.
    const span = RAIL_WIDTH - RAIL_INSET * 2;
    expect(layout.rails[0]!.beads[0]!.x).toBeCloseTo(RAIL_INSET + span / 2);
  });

  it("pushes crowded beads apart so their labels can't collide", () => {
    const layout = buildMilestoneRails([
      process({
        id: "a",
        code: "NEW100",
        stepCount: 40,
        steps: [
          step({ id: "s1", number: 1, milestone: true }),
          step({ id: "s2", number: 2, milestone: true }),
          step({ id: "s3", number: 3, milestone: true }),
        ],
      }),
    ]);

    const [b1, b2, b3] = layout.rails[0]!.beads;
    expect(b2!.x - b1!.x).toBeGreaterThanOrEqual(MIN_BEAD_GAP);
    expect(b3!.x - b2!.x).toBeGreaterThanOrEqual(MIN_BEAD_GAP);
  });

  it("starts a branching rail under the bead it leaves, and drops straight down to it", () => {
    const layout = buildMilestoneRails([
      process({
        id: "src",
        code: "NEW100",
        stepCount: 11,
        steps: [step({ id: "origin", number: 6, label: "CEO approval", branchedBy: ["GEO100"] })],
      }),
      process({
        id: "branch",
        code: "GEO100",
        stepCount: 3,
        branchFrom: { processId: "src", stepId: "origin" },
        steps: [step({ id: "g1", number: 1, milestone: true })],
      }),
    ]);

    const source = layout.rails.find((r) => r.processId === "src")!;
    const branch = layout.rails.find((r) => r.processId === "branch")!;
    const originX = source.offsetX + source.beads[0]!.x;

    expect(branch.offsetX).toBe(originX);
    expect(branch.branchFrom).toEqual({ code: "NEW100", stepLabel: "CEO approval", stepNumber: 6 });

    expect(layout.drops).toHaveLength(1);
    const drop = layout.drops[0]!;
    expect(drop.x).toBe(originX);
    expect(drop.fromY).toBe(source.y);
    expect(drop.toY).toBe(branch.y);
    expect(drop.label).toBe("↳ GEO100");
  });

  it("orders a branching process below the one it came from, whatever its code", () => {
    // GEO100 sorts before NEW100 alphabetically, but it branches from NEW100,
    // so it has to be drawn underneath it.
    const layout = buildMilestoneRails([
      process({
        id: "branch",
        code: "GEO100",
        stepCount: 2,
        branchFrom: { processId: "src", stepId: "origin" },
        steps: [step({ id: "g1", number: 1, milestone: true })],
      }),
      process({
        id: "src",
        code: "NEW100",
        stepCount: 2,
        steps: [step({ id: "origin", number: 1, branchedBy: ["GEO100"] })],
      }),
    ]);

    expect(layout.rails.map((r) => r.code)).toEqual(["NEW100", "GEO100"]);
  });

  it("still lays out when a branch origin sits on a process that isn't here", () => {
    const layout = buildMilestoneRails([
      process({
        id: "branch",
        code: "GEO100",
        stepCount: 2,
        branchFrom: { processId: "gone", stepId: "missing" },
        steps: [step({ id: "g1", number: 1, milestone: true })],
      }),
    ]);

    expect(layout.rails[0]!.offsetX).toBe(0);
    expect(layout.rails[0]!.branchFrom).toBeNull();
    expect(layout.drops).toEqual([]);
  });

  it("does not hang on a branch chain that loops", () => {
    const layout = buildMilestoneRails([
      process({ id: "a", code: "AAA100", branchFrom: { processId: "b", stepId: "s" }, stepCount: 1 }),
      process({ id: "b", code: "BBB100", branchFrom: { processId: "a", stepId: "t" }, stepCount: 1 }),
    ]);
    expect(layout.rails).toHaveLength(2);
  });

  it("widens the canvas to fit the furthest rail", () => {
    const layout = buildMilestoneRails([
      process({
        id: "src",
        code: "NEW100",
        stepCount: 2,
        steps: [step({ id: "origin", number: 2, branchedBy: ["GEO100"] })],
      }),
      process({
        id: "branch",
        code: "GEO100",
        stepCount: 1,
        branchFrom: { processId: "src", stepId: "origin" },
        steps: [step({ id: "g1", number: 1, milestone: true })],
      }),
    ]);

    const branch = layout.rails.find((r) => r.processId === "branch")!;
    expect(layout.width).toBe(branch.offsetX + RAIL_WIDTH);
  });

  it("handles a workspace with no processes", () => {
    const layout = buildMilestoneRails([]);
    expect(layout.rails).toEqual([]);
    expect(layout.drops).toEqual([]);
    expect(layout.milestoneCount).toBe(0);
  });
});
