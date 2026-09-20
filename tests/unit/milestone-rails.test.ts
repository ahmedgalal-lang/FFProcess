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

/**
 * Reported from a live report: a 22-step process marked with ten milestones
 * had its rail cut off mid-label — the last beads simply were not there.
 *
 * Beads are placed proportionally along the rail, then pushed apart when they
 * would land closer than MIN_BEAD_GAP so their labels cannot collide. That
 * push is what overflows: ten beads need nine gaps of 108 plus the inset,
 * which is well past RAIL_WIDTH. The layout's own width was computed from
 * RAIL_WIDTH alone, so the container it reported was narrower than the
 * picture it had drawn, and the overflow was clipped.
 */
describe("buildMilestoneRails — a rail with more beads than fit", () => {
  const crowded = process({
    id: "p-crowded",
    code: "TES100",
    name: "End to end high-level",
    stepCount: 22,
    steps: Array.from({ length: 10 }, (_, i) =>
      step({ id: `s${i + 1}`, number: i * 2 + 1, milestone: true, label: `Milestone ${i + 1}` })
    ),
  });

  it("draws every bead it was given", () => {
    const [rail] = buildMilestoneRails([crowded]).rails;
    expect(rail!.beads).toHaveLength(10);
  });

  it("reports a width that contains the beads it placed", () => {
    const layout = buildMilestoneRails([crowded]);
    const furthest = Math.max(...layout.rails[0]!.beads.map((b) => b.x));
    expect(layout.width).toBeGreaterThanOrEqual(furthest);
  });

  it("gives the rail its own width, so the track reaches its last bead", () => {
    const [rail] = buildMilestoneRails([crowded]).rails;
    const furthest = Math.max(...rail!.beads.map((b) => b.x));
    expect(rail!.width).toBeGreaterThanOrEqual(furthest);
  });

  it("still keeps the labels from colliding", () => {
    const [rail] = buildMilestoneRails([crowded]).rails;
    const xs = rail!.beads.map((b) => b.x);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(MIN_BEAD_GAP);
    }
  });

  it("leaves a rail that fits at the standard width, so nothing else moves", () => {
    const roomy = process({
      id: "p-roomy",
      code: "TES200",
      stepCount: 10,
      steps: [step({ id: "a", number: 1, milestone: true }), step({ id: "b", number: 10, milestone: true })],
    });
    const [rail] = buildMilestoneRails([roomy]).rails;
    expect(rail!.width).toBe(RAIL_WIDTH);
  });
});

/**
 * A rail with more beads than the page is wide used to be dealt with by
 * shrinking the whole drawing until it fitted — which at 22 milestones meant
 * a scale of about 0.43 and label text around 4px. Legible on a screen you can
 * zoom; not legible on the printed page this view exists to produce.
 *
 * It now wraps instead, and the rows run serpentine: each begins directly
 * under where the last ended, so the track stays one continuous line. The
 * beads never shrink.
 */
describe("buildMilestoneRails — wrapping a rail too wide for the page", () => {
  /** The printable width of an A4 landscape page, which is what the report has. */
  const PAGE = 1015;

  const long = process({
    id: "p-long",
    code: "TES100",
    name: "End to end high-level",
    stepCount: 22,
    steps: Array.from({ length: 22 }, (_, i) =>
      step({ id: `s${i + 1}`, number: i + 1, milestone: true, label: `Milestone ${i + 1}` })
    ),
  });

  it("is left on one row when it already fits", () => {
    const short = process({
      id: "p-short",
      code: "TES200",
      stepCount: 10,
      steps: [step({ id: "a", number: 1, milestone: true }), step({ id: "b", number: 10, milestone: true })],
    });
    const [rail] = buildMilestoneRails([short], { maxWidth: PAGE }).rails;
    expect(rail!.rows).toBe(1);
    expect(rail!.beads.every((b) => b.row === 0)).toBe(true);
    expect(rail!.height).toBe(RAIL_SPACING);
  });

  it("wraps a long rail onto rows instead of running off the page", () => {
    const [rail] = buildMilestoneRails([long], { maxWidth: PAGE }).rails;
    expect(rail!.rows).toBeGreaterThan(1);
    expect(rail!.beads).toHaveLength(22);
    // Nothing is placed beyond the page it was given.
    for (const bead of rail!.beads) {
      expect(bead.x, `bead ${bead.number}`).toBeLessThanOrEqual(PAGE);
      expect(bead.x).toBeGreaterThanOrEqual(0);
    }
    expect(rail!.width).toBeLessThanOrEqual(PAGE);
  });

  it("keeps every label clear of the page edges, which is what a centred label needs", () => {
    const [rail] = buildMilestoneRails([long], { maxWidth: PAGE }).rails;
    // A label is centred on its bead and about a slot wide, so a bead closer
    // to an edge than half a slot has its text cut off.
    const halfSlot = MIN_BEAD_GAP / 2;
    for (const bead of rail!.beads) {
      expect(bead.x, `bead ${bead.number} left edge`).toBeGreaterThanOrEqual(halfSlot);
      expect(bead.x, `bead ${bead.number} right edge`).toBeLessThanOrEqual(PAGE - halfSlot);
    }
  });

  it("never puts two beads closer than a label's width apart", () => {
    const [rail] = buildMilestoneRails([long], { maxWidth: PAGE }).rails;
    const rows = new Map<number, number[]>();
    for (const bead of rail!.beads) rows.set(bead.row, [...(rows.get(bead.row) ?? []), bead.x]);
    for (const [row, xs] of rows) {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]! - sorted[i - 1]!, `row ${row}`).toBeGreaterThanOrEqual(MIN_BEAD_GAP);
      }
    }
  });

  it("runs alternate rows backwards, so each begins under where the last ended", () => {
    const [rail] = buildMilestoneRails([long], { maxWidth: PAGE }).rails;
    const byRow = new Map<number, typeof rail.beads>();
    for (const bead of rail!.beads) byRow.set(bead.row, [...(byRow.get(bead.row) ?? []), bead]);

    // Row 0 ascends left to right; row 1 descends; row 2 ascends again.
    expect(byRow.get(0)!.map((b) => b.x)).toEqual([...byRow.get(0)!.map((b) => b.x)].sort((a, b) => a - b));
    expect(byRow.get(1)!.map((b) => b.x)).toEqual([...byRow.get(1)!.map((b) => b.x)].sort((a, b) => b - a));

    // ...and the turn is a straight drop: the last bead of a row and the first
    // of the next share a column.
    for (let r = 0; r < rail!.rows - 1; r++) {
      const ends = byRow.get(r)!.at(-1)!;
      const begins = byRow.get(r + 1)![0]!;
      expect(begins.x, `row ${r + 2} begins under where row ${r + 1} ended`).toBe(ends.x);
    }
  });

  it("gives each row its own line, and the rail the height to hold them", () => {
    const [rail] = buildMilestoneRails([long], { maxWidth: PAGE }).rails;
    expect(rail!.height).toBe(rail!.rows * RAIL_SPACING);
    for (const bead of rail!.beads) expect(bead.y).toBe(bead.row * RAIL_SPACING);
  });

  it("drops a branch from where the bead actually is, not from the rail's first line", () => {
    const branch = process({
      id: "p-branch",
      code: "TES300",
      stepCount: 3,
      branchFrom: { processId: "p-long", stepId: "s15" },
      steps: [step({ id: "b1", number: 1, milestone: true })],
    });
    const layout = buildMilestoneRails([long, branch], { maxWidth: PAGE });
    const source = layout.rails.find((r) => r.processId === "p-long")!;
    const origin = source.beads.find((b) => b.stepId === "s15")!;
    const drop = layout.drops[0]!;

    // Step 15 is on a later row, so the drop starts a row or more down the
    // rail — starting it at the rail's top would draw a line through the
    // rows in between.
    expect(origin.row).toBeGreaterThan(0);
    expect(drop.fromY).toBe(source.y + origin.y);
    expect(drop.x).toBe(source.offsetX + origin.x);
  });

  it("stacks the next process below the whole wrapped rail, not on top of it", () => {
    const second = process({
      id: "p-second",
      code: "TES400",
      stepCount: 2,
      steps: [step({ id: "x", number: 1, milestone: true })],
    });
    const layout = buildMilestoneRails([long, second], { maxWidth: PAGE });
    const first = layout.rails.find((r) => r.processId === "p-long")!;
    const next = layout.rails.find((r) => r.processId === "p-second")!;
    expect(next.y).toBe(first.y + first.height);
    expect(layout.height).toBe(first.height + next.height);
  });

  it("does not wrap at all when it is given no width to fit", () => {
    // The interactive view scrolls and has no page to respect, so it keeps
    // the proportional placement it always had.
    const [rail] = buildMilestoneRails([long]).rails;
    expect(rail!.rows).toBe(1);
    expect(rail!.width).toBeGreaterThan(PAGE);
  });

  it("never asks for fewer than two beads a row, however little room it is given", () => {
    for (const maxWidth of [0, 1, 50, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const [rail] = buildMilestoneRails([long], { maxWidth }).rails;
      const perRow = new Map<number, number>();
      for (const bead of rail!.beads) perRow.set(bead.row, (perRow.get(bead.row) ?? 0) + 1);
      expect(Math.max(...perRow.values()), `maxWidth ${maxWidth}`).toBeGreaterThanOrEqual(2);
      expect(rail!.rows).toBeLessThanOrEqual(22);
    }
  });
});
