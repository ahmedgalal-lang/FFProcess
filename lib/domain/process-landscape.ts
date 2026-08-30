/**
 * The helicopter view: the whole engagement's processes as one graph, and
 * where each one sits in it.
 *
 * Two kinds of relationship connect processes, and they mean different things,
 * so they stay separate here rather than being flattened into "related":
 *
 *  - a **branch** — this process doesn't start on its own, it resumes from a
 *    step of another one (Process.branchFromStepId), carrying its own people
 *    and RACI from that point;
 *  - a **link** — a step in one process points at another process
 *    (ProcessStepLink), a hand-off rather than a continuation.
 *
 * The parent/sub-process hierarchy is deliberately NOT an edge: that's filing
 * (where a process sits in the tree), not flow, and drawing it as a connector
 * would imply work moves along it. It rides on the card instead.
 *
 * Pure and framework-free (Constitution Principle III) — no Prisma, no React
 * Flow — so the layout can be unit-tested without a canvas.
 */

export const CARD_WIDTH = 210;
export const CARD_HEIGHT = 78;
export const COLUMN_SPACING = 340;
export const ROW_SPACING = 122;

export type LandscapeInput = {
  id: string;
  code: string;
  name: string;
  stepCount: number;
  /** Code of the main process this one is filed under, for the card's eyebrow. */
  parentCode: string | null;
  /** Set when this process resumes from a step of another one. */
  branchFrom: { processId: string; stepLabel: string; stepNumber: number } | null;
  /** One entry per step link out of this process. */
  linksTo: { targetProcessId: string; fromStepLabel: string }[];
};

export type LandscapeEdge = {
  id: string;
  kind: "branch" | "link";
  fromProcessId: string;
  toProcessId: string;
  /** Short caption drawn on the connector. */
  label: string;
  /** Full sentence for screen readers. */
  description: string;
};

export type LandscapeNode = {
  process: LandscapeInput;
  column: number;
  row: number;
  x: number;
  y: number;
};

export type ProcessLandscape = {
  nodes: LandscapeNode[];
  edges: LandscapeEdge[];
  /** Number of columns the graph spans — one per flow depth. */
  columnCount: number;
};

/**
 * Builds the edges between processes. Link edges are deduplicated per pair:
 * three steps of PUR101 pointing at PUR102 is one connector carrying the count,
 * not three overlapping lines.
 */
function buildEdges(processes: LandscapeInput[]): LandscapeEdge[] {
  const byId = new Map(processes.map((p) => [p.id, p]));
  const edges: LandscapeEdge[] = [];

  for (const p of processes) {
    if (p.branchFrom && byId.has(p.branchFrom.processId)) {
      const source = byId.get(p.branchFrom.processId)!;
      edges.push({
        id: `branch-${p.id}`,
        kind: "branch",
        fromProcessId: source.id,
        toProcessId: p.id,
        label: `↰ step ${p.branchFrom.stepNumber}`,
        description: `${p.code} ${p.name} picks up from step ${p.branchFrom.stepNumber}, ${p.branchFrom.stepLabel}, of ${source.code} ${source.name}`,
      });
    }
  }

  for (const p of processes) {
    const countByTarget = new Map<string, string[]>();
    for (const link of p.linksTo) {
      if (!byId.has(link.targetProcessId) || link.targetProcessId === p.id) continue;
      const labels = countByTarget.get(link.targetProcessId) ?? [];
      labels.push(link.fromStepLabel);
      countByTarget.set(link.targetProcessId, labels);
    }
    for (const [targetId, stepLabels] of countByTarget) {
      const target = byId.get(targetId)!;
      edges.push({
        id: `link-${p.id}-${targetId}`,
        kind: "link",
        fromProcessId: p.id,
        toProcessId: targetId,
        label: stepLabels.length === 1 ? "🔗" : `🔗 ×${stepLabels.length}`,
        description: `${p.code} ${p.name} links to ${target.code} ${target.name} from ${stepLabels.join(", ")}`,
      });
    }
  }

  return edges;
}

/**
 * Column per process: one further right than the furthest thing that feeds it,
 * so flow reads left to right. Relaxation is capped at one pass per process,
 * which settles any acyclic graph and simply stops growing on a cycle — step
 * links can legitimately point both ways between two processes, so a cycle
 * here is data to draw, not an error to reject.
 */
function assignColumns(processes: LandscapeInput[], edges: LandscapeEdge[]): Map<string, number> {
  const column = new Map(processes.map((p) => [p.id, 0]));

  for (let pass = 0; pass < processes.length; pass++) {
    let changed = false;
    for (const edge of edges) {
      const candidate = (column.get(edge.fromProcessId) ?? 0) + 1;
      if (candidate > (column.get(edge.toProcessId) ?? 0)) {
        column.set(edge.toProcessId, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return column;
}

/**
 * Lays the workspace's processes out as a left-to-right graph. Processes with
 * nothing feeding them start in the first column; everything else sits to the
 * right of whatever it continues from. Within a column, order follows Process
 * Code so the picture is stable between visits rather than reshuffling.
 */
export function buildProcessLandscape(processes: LandscapeInput[]): ProcessLandscape {
  const edges = buildEdges(processes);
  const column = assignColumns(processes, edges);

  const sorted = [...processes].sort((a, b) => a.code.localeCompare(b.code));
  const rowCursor = new Map<number, number>();

  const nodes: LandscapeNode[] = sorted.map((process) => {
    const col = column.get(process.id) ?? 0;
    const row = rowCursor.get(col) ?? 0;
    rowCursor.set(col, row + 1);
    return {
      process,
      column: col,
      row,
      x: col * COLUMN_SPACING,
      y: row * ROW_SPACING,
    };
  });

  return {
    nodes,
    edges,
    columnCount: nodes.length === 0 ? 0 : Math.max(...nodes.map((n) => n.column)) + 1,
  };
}

/** One-line summary for the page header — what the picture is showing. */
export function describeLandscape(landscape: ProcessLandscape): string {
  const branches = landscape.edges.filter((e) => e.kind === "branch").length;
  const links = landscape.edges.filter((e) => e.kind === "link").length;
  const parts = [`${landscape.nodes.length} ${landscape.nodes.length === 1 ? "process" : "processes"}`];
  if (branches > 0) parts.push(`${branches} ${branches === 1 ? "branch" : "branches"}`);
  if (links > 0) parts.push(`${links} step ${links === 1 ? "link" : "links"}`);
  return parts.join(" · ");
}
