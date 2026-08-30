/**
 * The Helicopter View's rails: each process as one horizontal track, with the
 * few steps worth seeing from engagement level as beads along it, and a branch
 * dropping from the exact bead it leaves to the rail that picks up.
 *
 * What earns a bead is two things, not one:
 *  - a **milestone**, a step someone deliberately marked as significant;
 *  - a **junction**, a step another process actually depends on — one another
 *    process branches from, or one that links out to another process.
 *
 * Junctions are included whether or not they're marked, because they're the
 * reason this view exists: a rail that hid the step another process resumes
 * from would have nowhere to attach that process. A junction that nobody
 * marked is drawn as the lesser thing it is.
 *
 * Pure and framework-free (Constitution Principle III) — no Prisma, no DOM —
 * so the geometry is unit-testable without rendering anything.
 */

/** Width of a rail's track, in the same units the view lays out in. */
export const RAIL_WIDTH = 720;
/** Height of a rail that has beads to show. */
export const RAIL_SPACING = 132;
/** Height of a rail with nothing on it — it still appears, but takes little room. */
export const EMPTY_RAIL_SPACING = 60;
/** Beads closer together than this are pushed apart so their labels can't collide. */
export const MIN_BEAD_GAP = 108;
/** Left inset of the first bead, so a bead at step 1 isn't flush to the rail's end. */
export const RAIL_INSET = 16;

export type RailStep = {
  id: string;
  label: string;
  type: "START" | "TASK" | "DECISION" | "END";
  /** 1-based position in the process's own Steps List. */
  number: number;
  milestone: boolean;
  /** Codes of processes this step links out to. */
  linksTo: string[];
  /** Codes of processes that branch from this step. */
  branchedBy: string[];
};

export type RailProcess = {
  id: string;
  code: string;
  name: string;
  stepCount: number;
  /** Set when this process resumes from a step of another one. */
  branchFrom: { processId: string; stepId: string } | null;
  steps: RailStep[];
};

export type Bead = {
  stepId: string;
  label: string;
  number: number;
  /** Position along the rail, before the rail's own offset is added. */
  x: number;
  isMilestone: boolean;
  isDecision: boolean;
  /** Codes of processes that branch from this step. */
  branchedBy: string[];
  /** Codes of processes this step links out to. */
  linksTo: string[];
};

export type Rail = {
  processId: string;
  code: string;
  name: string;
  stepCount: number;
  /** Where this rail starts, so a branching one sits under the bead it leaves. */
  offsetX: number;
  y: number;
  /** How much vertical room this rail takes — less when it has nothing on it. */
  height: number;
  beads: Bead[];
  /** True when nothing on this process earned a bead — the rail is empty. */
  isEmpty: boolean;
  /** Set for a rail that picks up from another process. */
  branchFrom: { code: string; stepLabel: string; stepNumber: number } | null;
};

/** A dashed line from a bead on one rail down to the rail that picks up there. */
export type Drop = {
  id: string;
  fromRailId: string;
  toRailId: string;
  /** Absolute x, shared by both ends — a drop is always vertical. */
  x: number;
  fromY: number;
  toY: number;
  label: string;
};

export type MilestoneRailsLayout = {
  rails: Rail[];
  drops: Drop[];
  width: number;
  height: number;
  /** Steps marked as milestones across the whole workspace. */
  milestoneCount: number;
};

/** Whether a step earns a place on the rail, and why. */
function earnsBead(step: RailStep): boolean {
  return step.milestone || step.branchedBy.length > 0 || step.linksTo.length > 0;
}

/**
 * Spreads beads along the rail in proportion to where their step falls in the
 * process, then pushes any that landed too close to the one before it far
 * enough apart to stay readable. Proportional rather than evenly spaced so
 * "step 4 of 17" reads as near the beginning, which is the whole point of
 * showing the number.
 */
function positionBeads(steps: RailStep[], stepCount: number): number[] {
  const span = Math.max(RAIL_WIDTH - RAIL_INSET * 2, 0);
  const positions: number[] = [];
  let previous = -Infinity;

  for (const step of steps) {
    const fraction = stepCount <= 1 ? 0 : (step.number - 1) / (stepCount - 1);
    const proportional = RAIL_INSET + fraction * span;
    const x = Math.max(proportional, previous + MIN_BEAD_GAP);
    positions.push(x);
    previous = x;
  }

  return positions;
}

/**
 * Orders the rails so a process is followed immediately by whatever branches
 * off it. Adjacency is the point: the drop from a bead to the rail that picks
 * up there should be a short line, not one crossing unrelated processes on its
 * way down. Ties keep Process Code order so the picture is the same between
 * visits.
 */
function orderProcesses(processes: RailProcess[]): RailProcess[] {
  const byId = new Map(processes.map((p) => [p.id, p]));
  const sorted = [...processes].sort((a, b) => a.code.localeCompare(b.code));

  const branchesOf = new Map<string, RailProcess[]>();
  for (const process of sorted) {
    const sourceId = process.branchFrom?.processId;
    if (!sourceId || !byId.has(sourceId)) continue;
    const list = branchesOf.get(sourceId) ?? [];
    list.push(process);
    branchesOf.set(sourceId, list);
  }

  const placed: RailProcess[] = [];
  const seen = new Set<string>();

  // Iterative rather than recursive, and guarded by `seen`, so a branch chain
  // that loops in the data can't hang the layout.
  function place(root: RailProcess) {
    const stack = [root];
    while (stack.length > 0) {
      const process = stack.pop()!;
      if (seen.has(process.id)) continue;
      seen.add(process.id);
      placed.push(process);
      const children = branchesOf.get(process.id) ?? [];
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
    }
  }

  // Roots first — a process that starts on its own, or whose origin isn't here.
  for (const process of sorted) {
    const sourceId = process.branchFrom?.processId;
    if (!sourceId || !byId.has(sourceId)) place(process);
  }
  // Anything left is inside a loop; place it so nothing is silently dropped.
  for (const process of sorted) place(process);

  return placed;
}

/**
 * Lays out the whole engagement as rails. Every process gets one, whether or
 * not anything on it earned a bead — an empty rail is how the view says "this
 * process has nothing marked yet" rather than quietly leaving it out.
 */
export function buildMilestoneRails(processes: RailProcess[]): MilestoneRailsLayout {
  const ordered = orderProcesses(processes);
  const rails: Rail[] = [];
  const railById = new Map<string, Rail>();
  const beadAt = new Map<string, { railId: string; absoluteX: number; y: number }>();

  let nextY = 0;
  ordered.forEach((process) => {
    const shown = process.steps.filter(earnsBead);
    const xs = positionBeads(shown, process.stepCount);

    const beads: Bead[] = shown.map((step, i) => ({
      stepId: step.id,
      label: step.label,
      number: step.number,
      x: xs[i]!,
      isMilestone: step.milestone,
      isDecision: step.type === "DECISION",
      branchedBy: step.branchedBy,
      linksTo: step.linksTo,
    }));

    // A branching rail starts under the bead it leaves, so its drop is a short
    // vertical line rather than a diagonal across the picture. When the origin
    // step somehow isn't on the source rail, it falls back to the left edge.
    let offsetX = 0;
    let branchFrom: Rail["branchFrom"] = null;
    if (process.branchFrom) {
      const origin = beadAt.get(process.branchFrom.stepId);
      const sourceProcess = processes.find((p) => p.id === process.branchFrom!.processId);
      const originStep = sourceProcess?.steps.find((s) => s.id === process.branchFrom!.stepId);
      if (origin) offsetX = origin.absoluteX;
      if (sourceProcess && originStep) {
        branchFrom = {
          code: sourceProcess.code,
          stepLabel: originStep.label,
          stepNumber: originStep.number,
        };
      }
    }

    const isEmpty = beads.length === 0;
    const rail: Rail = {
      processId: process.id,
      code: process.code,
      name: process.name,
      stepCount: process.stepCount,
      offsetX,
      y: nextY,
      height: isEmpty ? EMPTY_RAIL_SPACING : RAIL_SPACING,
      beads,
      isEmpty,
      branchFrom,
    };
    nextY += rail.height;

    rails.push(rail);
    railById.set(process.id, rail);
    for (const bead of beads) {
      beadAt.set(bead.stepId, { railId: process.id, absoluteX: offsetX + bead.x, y: rail.y });
    }
  });

  const drops: Drop[] = [];
  for (const process of ordered) {
    if (!process.branchFrom) continue;
    const source = railById.get(process.branchFrom.processId);
    const target = railById.get(process.id);
    const origin = beadAt.get(process.branchFrom.stepId);
    if (!source || !target || !origin) continue;
    drops.push({
      id: `drop-${process.id}`,
      fromRailId: source.processId,
      toRailId: target.processId,
      x: origin.absoluteX,
      fromY: source.y,
      toY: target.y,
      label: `↳ ${process.code}`,
    });
  }

  return {
    rails,
    drops,
    width: rails.reduce((widest, rail) => Math.max(widest, rail.offsetX + RAIL_WIDTH), RAIL_WIDTH),
    height: nextY,
    milestoneCount: processes.reduce((n, p) => n + p.steps.filter((s) => s.milestone).length, 0),
  };
}
