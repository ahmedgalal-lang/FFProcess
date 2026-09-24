/**
 * What the printed process map claims about a process.
 *
 * Pure and framework-free, like `process-layout.ts` and `connector-routing.ts`
 * beside it: no DOM, no Prisma, no clock, no randomness. It decides *what* the
 * map asserts — which path continues, which label belongs to which branch,
 * where paths converge — and the renderers only draw what it returns.
 *
 * It deliberately does not shorten anything. Fitting a label on a page is the
 * renderer's job, and the renderer does it by wrapping text rather than cutting
 * it, which is the whole reason the printed map was rebuilt: the old one drew
 * fixed-size cards on a canvas, so a long label had nowhere to go but over the
 * edge of its own box.
 */

/** Deepest a branch may indent before it starts eating the label width. */
export const MAX_BRANCH_INDENT = 2;

/**
 * Most roles the Roles layout can give a column to and stay readable.
 *
 * At the report's 269mm content width a card needs roughly 52mm to set 8pt text
 * about three words to a line without breaking mid-word; five columns plus
 * their gaps is the last count that clears that. Above it the layout falls back
 * rather than printing columns nobody can read.
 */
export const MAX_ROLE_COLUMNS = 5;

export type PrintStepKind = "start" | "task" | "decision" | "end";

export type PrintStepInput = {
  id: string;
  /** 1-based position in the process — the Steps List order, never a canvas position. */
  order: number;
  label: string;
  roleName: string | null;
  kind: PrintStepKind;
  /** Whether this step needs every one of its predecessors, not just one (spec 015). */
  joinRequiresAll: boolean;
  /** What a reader sees instead of a bare `order` — "4", or "4a"/"4b" for a genuine parallel pair (spec 016). */
  numberLabel: string;
};

export type PrintConnectionInput = {
  id: string;
  fromStepId: string;
  toStepId: string;
  label: string | null;
};

export type LayoutInput = {
  /** Already sorted by `order`. */
  steps: PrintStepInput[];
  connections: PrintConnectionInput[];
  requested: "FLOW" | "ROLES";
};

/** Which rail piece a row draws, which is also what the row means. */
export type FlowRail = "first" | "spine" | "branch" | "merge" | "last";

export type FlowRow = {
  step: PrintStepInput;
  indent: number;
  rail: FlowRail;
  /**
   * The label of the connection that reaches this step, when it is a spur off a
   * decision — read from that connection, never searched for among the
   * connections that happen to touch this step.
   */
  branchLabel: string | null;
  /** Nothing leaves this step: a terminated branch, or the end of the process. */
  endsHere: boolean;
  /** Every step converging here, when this row is a merge — empty otherwise. */
  mergesFrom: { order: number; label: string; numberLabel: string }[];
};

/** A connection no rail can draw — a loop, or a jump the layout cannot span. */
export type BackReference = {
  connectionId: string;
  fromOrder: number;
  toOrder: number;
  fromNumberLabel: string;
  toNumberLabel: string;
  toLabel: string;
  label: string | null;
  direction: "back" | "ahead";
};

export type FlowOutline = {
  rows: FlowRow[];
  backReferences: BackReference[];
  /** Every connection the rails account for, so nothing is silently dropped. */
  drawnConnectionIds: string[];
};

export type RolesCell = {
  step: PrintStepInput;
  column: number;
  row: number;
  /** Every step converging here, when this step is a merge — mirrors FlowRow.mergesFrom. */
  mergesFrom: { order: number; label: string; numberLabel: string }[];
};

export type RolesConnector = {
  connectionId: string;
  fromRow: number;
  fromColumn: number;
  toRow: number;
  toColumn: number;
  label: string | null;
};

export type RolesGrid = {
  /** The roles this process actually uses, in first-appearance order. */
  columns: string[];
  cells: RolesCell[];
  connectors: RolesConnector[];
  backReferences: BackReference[];
};

export type LayoutOutcome =
  | { layout: "FLOW"; flow: FlowOutline; fellBackFrom?: "ROLES"; reason?: string }
  | { layout: "ROLES"; roles: RolesGrid };

/** The label a roleless step's column carries, so the step still appears. */
export const NO_ROLE_COLUMN = "No role set";

export function buildPrintMapLayout(input: LayoutInput): LayoutOutcome {
  const steps = [...input.steps].sort((a, b) => a.order - b.order);
  const byId = new Map(steps.map((s) => [s.id, s]));

  // Only connections with both ends in this process are the map's business. A
  // cross-process link is drawn on the card itself, not as a rail.
  const connections = input.connections.filter(
    (c) => byId.has(c.fromStepId) && byId.has(c.toStepId)
  );

  if (input.requested === "ROLES") {
    const roleCount = countRoleColumns(steps);
    if (roleCount <= MAX_ROLE_COLUMNS) {
      return { layout: "ROLES", roles: buildRolesGrid(steps, connections, byId) };
    }
    return {
      layout: "FLOW",
      flow: buildFlowOutline(steps, connections, byId),
      fellBackFrom: "ROLES",
      reason:
        `This process uses ${roleCount} roles. The Roles layout draws at most ` +
        `${MAX_ROLE_COLUMNS} columns before the cards are too narrow to read, so it has ` +
        `printed in the Flow layout instead.`,
    };
  }

  return { layout: "FLOW", flow: buildFlowOutline(steps, connections, byId) };
}

function countRoleColumns(steps: PrintStepInput[]): number {
  const names = new Set<string>();
  for (const step of steps) names.add(step.roleName ?? NO_ROLE_COLUMN);
  return names.size;
}

/**
 * Which of a decision's outgoing connections carries on down the spine.
 *
 * The one reaching furthest through the process: a decision usually forks into
 * the path the process takes and an exception that stops (a rejection, an
 * escalation), and indenting the rest of the process under the exception it did
 * *not* take reads backwards. Choosing by target order rather than by, say,
 * connection order makes the drawing the same every time it is rendered, which
 * matters because a stored connection has no inherent position.
 *
 * Once the step editor records which outcome a decision considers its main
 * path, this becomes the fallback for processes authored before it.
 */
function spineTargetOf(
  decision: PrintStepInput,
  outgoing: PrintConnectionInput[],
  byId: Map<string, PrintStepInput>
): string | null {
  let best: PrintStepInput | null = null;
  for (const connection of outgoing) {
    const target = byId.get(connection.toStepId);
    if (!target || target.id === decision.id) continue;
    if (!best || target.order > best.order) best = target;
  }
  return best?.id ?? null;
}

function buildFlowOutline(
  steps: PrintStepInput[],
  connections: PrintConnectionInput[],
  byId: Map<string, PrintStepInput>
): FlowOutline {
  const outgoing = new Map<string, PrintConnectionInput[]>();
  const incoming = new Map<string, PrintConnectionInput[]>();
  for (const connection of connections) {
    (outgoing.get(connection.fromStepId) ?? outgoing.set(connection.fromStepId, []).get(connection.fromStepId)!).push(connection);
    (incoming.get(connection.toStepId) ?? incoming.set(connection.toStepId, []).get(connection.toStepId)!).push(connection);
  }

  // Which step each decision hands the spine to, so a spur is recognisable as
  // "a branch target that is not the continuation".
  const spineTarget = new Map<string, string>();
  for (const step of steps) {
    if (step.kind !== "decision") continue;
    const target = spineTargetOf(step, outgoing.get(step.id) ?? [], byId);
    if (target) spineTarget.set(step.id, target);
  }

  const indentOf = new Map<string, number>();
  const rows: FlowRow[] = [];
  const drawn = new Set<string>();

  for (const [index, step] of steps.entries()) {
    const inbound = (incoming.get(step.id) ?? []).filter((c) => {
      const source = byId.get(c.fromStepId);
      // Only a connection arriving from further up the page can set this row's
      // depth; one arriving from below is a loop, handled as a back-reference.
      return source !== undefined && source.order < step.order;
    });

    // The spur that a decision did not hand the spine to steps in one level;
    // everything else inherits, and a merge returns to the shallowest path
    // that reached it.
    let indent = 0;
    let branchLabel: string | null = null;
    const spurFrom = inbound.find(
      (c) => byId.get(c.fromStepId)?.kind === "decision" && spineTarget.get(c.fromStepId) !== step.id
    );

    if (spurFrom) {
      indent = Math.min((indentOf.get(spurFrom.fromStepId) ?? 0) + 1, MAX_BRANCH_INDENT);
    } else if (inbound.length > 0) {
      indent = Math.min(...inbound.map((c) => indentOf.get(c.fromStepId) ?? 0));
    }

    // Every path out of a decision carries its own label, including the one
    // that continues the spine rather than spurring: a fork labelled Yes/No
    // must show both words, or the reader is told what the exception was and
    // left to assume the rest. Read from the decision's own connection — never
    // from whichever connection touching this step happens to have a label.
    const decisionEdge =
      spurFrom ?? inbound.find((c) => byId.get(c.fromStepId)?.kind === "decision");
    branchLabel = decisionEdge?.label ?? null;

    indentOf.set(step.id, indent);

    const mergesFrom = inbound.length > 1
      ? inbound
          .map((c) => byId.get(c.fromStepId)!)
          .map((s) => ({ order: s.order, label: s.label, numberLabel: s.numberLabel }))
          .sort((a, b) => a.order - b.order)
      : [];

    const leaves = outgoing.get(step.id) ?? [];
    const rail: FlowRail =
      index === 0 ? "first"
      : mergesFrom.length > 0 ? "merge"
      : spurFrom ? "branch"
      : index === steps.length - 1 ? "last"
      : "spine";

    rows.push({
      step,
      indent,
      rail,
      branchLabel,
      endsHere: leaves.length === 0,
      mergesFrom,
    });

    // Every inbound connection this row's rail accounts for: the spur's elbow,
    // the merge's converging lines, or the spine arriving from the step above.
    for (const connection of inbound) drawn.add(connection.id);
  }

  // A decision hands the spine on to a step that is not the next row — the spur
  // sits between them — and the spine itself draws that.
  for (const [decisionId, targetId] of spineTarget) {
    const connection = (outgoing.get(decisionId) ?? []).find((c) => c.toStepId === targetId);
    if (connection) drawn.add(connection.id);
  }

  const backReferences: BackReference[] = [];
  for (const connection of connections) {
    if (drawn.has(connection.id)) continue;
    const from = byId.get(connection.fromStepId)!;
    const to = byId.get(connection.toStepId)!;
    backReferences.push({
      connectionId: connection.id,
      fromOrder: from.order,
      toOrder: to.order,
      fromNumberLabel: from.numberLabel,
      toNumberLabel: to.numberLabel,
      toLabel: to.label,
      label: connection.label,
      direction: to.order < from.order ? "back" : "ahead",
    });
  }

  return { rows, backReferences, drawnConnectionIds: [...drawn] };
}

function buildRolesGrid(
  steps: PrintStepInput[],
  connections: PrintConnectionInput[],
  byId: Map<string, PrintStepInput>
): RolesGrid {
  const columns: string[] = [];
  const columnOf = new Map<string, number>();
  for (const step of steps) {
    const role = step.roleName ?? NO_ROLE_COLUMN;
    if (!columnOf.has(role)) {
      columnOf.set(role, columns.length);
      columns.push(role);
    }
  }

  // Every connection landing on a step, regardless of whether the grid draws
  // it as an adjacent-row connector or names it as a back-reference — the
  // same inbound set FlowRow.mergesFrom is computed from, so a merge reads
  // the same way in both layouts.
  const incoming = new Map<string, PrintConnectionInput[]>();
  for (const connection of connections) {
    (incoming.get(connection.toStepId) ?? incoming.set(connection.toStepId, []).get(connection.toStepId)!).push(
      connection
    );
  }

  const rowOf = new Map<string, number>();
  const cells: RolesCell[] = steps.map((step, row) => {
    rowOf.set(step.id, row);
    const inbound = incoming.get(step.id) ?? [];
    const mergesFrom =
      inbound.length > 1
        ? inbound
            .map((c) => byId.get(c.fromStepId)!)
            .map((s) => ({ order: s.order, label: s.label, numberLabel: s.numberLabel }))
            .sort((a, b) => a.order - b.order)
        : [];
    return { step, column: columnOf.get(step.roleName ?? NO_ROLE_COLUMN)!, row, mergesFrom };
  });

  const connectors: RolesConnector[] = [];
  const backReferences: BackReference[] = [];

  for (const connection of connections) {
    const from = byId.get(connection.fromStepId)!;
    const to = byId.get(connection.toStepId)!;
    const fromRow = rowOf.get(from.id)!;
    const toRow = rowOf.get(to.id)!;

    // A connector is a shape in the gap between two rows, so it can only join a
    // row to one below it. Anything else — a loop, or a jump over rows the
    // connector would have to cross — is named on the card instead.
    if (toRow === fromRow + 1) {
      connectors.push({
        connectionId: connection.id,
        fromRow,
        fromColumn: columnOf.get(from.roleName ?? NO_ROLE_COLUMN)!,
        toRow,
        toColumn: columnOf.get(to.roleName ?? NO_ROLE_COLUMN)!,
        label: connection.label,
      });
      continue;
    }

    backReferences.push({
      connectionId: connection.id,
      fromOrder: from.order,
      toOrder: to.order,
      fromNumberLabel: from.numberLabel,
      toNumberLabel: to.numberLabel,
      toLabel: to.label,
      label: connection.label,
      direction: to.order < from.order ? "back" : "ahead",
    });
  }

  return { columns, cells, connectors, backReferences };
}
