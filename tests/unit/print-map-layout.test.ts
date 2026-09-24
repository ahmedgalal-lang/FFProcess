import { describe, it, expect } from "vitest";
import {
  buildPrintMapLayout,
  MAX_BRANCH_INDENT,
  MAX_ROLE_COLUMNS,
  type PrintConnectionInput,
  type PrintStepInput,
} from "@/lib/domain/print-map-layout";

/**
 * What the printed map is allowed to claim about a process.
 *
 * These are the decisions, not the drawing: which connection continues the
 * spine, which label belongs to which branch, what happens past the role
 * ceiling. The drawing is measured separately, in tests/e2e/printed-map.spec.ts,
 * because the spec's criteria are properties of rendered output.
 */

function step(
  order: number,
  label: string,
  opts: Partial<Omit<PrintStepInput, "order" | "label">> = {}
): PrintStepInput {
  return {
    id: `s${order}`,
    order,
    label,
    // `in` rather than `??`, so a step can be given no role at all — which is
    // exactly what one of the cases below is testing.
    roleName: "roleName" in opts ? (opts.roleName ?? null) : "Analyst",
    kind: opts.kind ?? "task",
    joinRequiresAll: opts.joinRequiresAll ?? false,
    numberLabel: opts.numberLabel ?? String(order),
  };
}

function link(from: number, to: number, label: string | null = null): PrintConnectionInput {
  return { id: `c${from}-${to}`, fromStepId: `s${from}`, toStepId: `s${to}`, label };
}

/**
 * The reported shape, reduced to what the layout has to reason about: a
 * decision forking to a dead-end and onward, and a later decision whose two
 * branches converge again. Mirrors tests/fixtures/tender-process.ts.
 */
const TENDER_STEPS: PrintStepInput[] = [
  step(1, "RFQ", { kind: "start", roleName: "CEO" }),
  step(2, "Evaluate the opportunity", { kind: "decision", roleName: "CEO" }),
  step(3, "Rejected — notify the requester", { roleName: "CEO" }),
  step(4, "Accepted: CCO based on the SCOPE", { roleName: "Head of Commercial" }),
  step(5, "Technical clarification", { roleName: "Head of Commercial" }),
  step(6, "Letter of award from the client", { kind: "decision", roleName: "Head of Commercial" }),
  step(7, "Contract drafting", { roleName: "Head of Commercial" }),
  step(8, "Outsourcing legal firm", { roleName: "Legal" }),
  step(9, "Sign contract", { roleName: "Head of Commercial" }),
  step(10, "Execution", { kind: "end", roleName: "Sector Owner" }),
];

const TENDER_LINKS: PrintConnectionInput[] = [
  link(1, 2),
  link(2, 3, "No"),
  link(2, 4, "Yes"),
  link(4, 5),
  link(5, 6),
  link(6, 7, "Locally"),
  link(6, 8, "Internationally"),
  link(7, 9),
  link(8, 9),
  link(9, 10),
];

function flowOf(steps: PrintStepInput[], connections: PrintConnectionInput[]) {
  const outcome = buildPrintMapLayout({ steps, connections, requested: "FLOW" });
  if (outcome.layout !== "FLOW") throw new Error("expected a FLOW outcome");
  return outcome.flow;
}

describe("buildPrintMapLayout — FLOW", () => {
  it("prints every step exactly once, in order", () => {
    const flow = flowOf(TENDER_STEPS, TENDER_LINKS);
    expect(flow.rows).toHaveLength(TENDER_STEPS.length);
    expect(flow.rows.map((r) => r.step.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("never shortens a label, however long", () => {
    const long = "Internal resources evaluation and needs (e.g.; Hr, staffing, salaries, etc..)";
    const flow = flowOf([step(1, long)], []);
    expect(flow.rows[0]!.step.label).toBe(long);
  });

  it("continues the spine through the decision's onward path, and spurs the exception", () => {
    // Step 2 forks to 3 (a dead end) and 4 (the rest of the process). The
    // process must not spend the rest of its length indented under the
    // rejection it did not take.
    const flow = flowOf(TENDER_STEPS, TENDER_LINKS);
    const byOrder = new Map(flow.rows.map((r) => [r.step.order, r]));

    expect(byOrder.get(3)!.indent).toBe(1);
    expect(byOrder.get(3)!.rail).toBe("branch");
    expect(byOrder.get(4)!.indent).toBe(0);
    expect(byOrder.get(5)!.indent).toBe(0);
  });

  it("gives each branch the label of its own connection, never a neighbour's", () => {
    // The bug this replaces: a marker found its label by searching every
    // labelled connection touching the step, so it could display one belonging
    // to a different connection entirely.
    const flow = flowOf(TENDER_STEPS, TENDER_LINKS);
    const byOrder = new Map(flow.rows.map((r) => [r.step.order, r]));

    expect(byOrder.get(3)!.branchLabel).toBe("No");
    expect(byOrder.get(7)!.branchLabel).toBe("Locally");
    // Both sides of a fork are labelled, including the one that carries on down
    // the spine — a Yes/No decision that printed only "No" would tell the
    // reader what the exception was and leave them to assume the rest.
    expect(byOrder.get(4)!.branchLabel).toBe("Yes");
    expect(byOrder.get(8)!.branchLabel).toBe("Internationally");
    // Step 9 is reached by two unlabelled connections and must not borrow
    // "Locally" or "Internationally" from the fork above it.
    expect(byOrder.get(9)!.branchLabel).toBeNull();
  });

  it("takes the branch label from the decision's own connection when others also reach the step", () => {
    // The sharp version of the rule. Step 4 is a spur off decision 2 ("No"),
    // and is *also* fed by step 3 with a different label. Anything that finds
    // the label by searching the connections touching step 4 — which is what
    // the old marker did — picks up "Also feeds 4" instead.
    const steps = [
      step(1, "Start", { kind: "start" }),
      step(2, "Decide", { kind: "decision" }),
      step(3, "Side task"),
      step(4, "Exception path"),
      step(5, "Carry on"),
    ];
    const connections: PrintConnectionInput[] = [
      link(1, 2),
      link(3, 4, "Also feeds 4"), // listed first, so a naive search finds it first
      link(2, 4, "No"),
      link(2, 5, "Yes"),
      link(1, 3),
    ];
    const flow = flowOf(steps, connections);
    const spur = flow.rows.find((r) => r.step.order === 4)!;

    expect(spur.branchLabel).toBe("No");
  });

  it("marks a branch that goes nowhere as ending there", () => {
    const flow = flowOf(TENDER_STEPS, TENDER_LINKS);
    const byOrder = new Map(flow.rows.map((r) => [r.step.order, r]));

    expect(byOrder.get(3)!.endsHere).toBe(true);
    expect(byOrder.get(4)!.endsHere).toBe(false);
  });

  it("records every step converging on a merge", () => {
    const flow = flowOf(TENDER_STEPS, TENDER_LINKS);
    const merge = flow.rows.find((r) => r.step.order === 9)!;

    expect(merge.rail).toBe("merge");
    expect(merge.mergesFrom).toEqual([
      { order: 7, label: "Contract drafting", numberLabel: "7" },
      { order: 8, label: "Outsourcing legal firm", numberLabel: "8" },
    ]);
    expect(merge.indent).toBe(0);
  });

  it("carries a merge step's own joinRequiresAll through to its row, with real predecessor labels available either way (spec 015)", () => {
    const steps = [
      step(1, "Start", { kind: "start" }),
      step(2, "Legal sign-off"),
      step(3, "Client sign-off"),
      step(4, "Countersign", { joinRequiresAll: true }),
    ];
    const links = [link(1, 2), link(1, 3), link(2, 4), link(3, 4)];
    const flow = flowOf(steps, links);
    const merge = flow.rows.find((r) => r.step.order === 4)!;

    expect(merge.step.joinRequiresAll).toBe(true);
    expect(merge.mergesFrom).toEqual([
      { order: 2, label: "Legal sign-off", numberLabel: "2" },
      { order: 3, label: "Client sign-off", numberLabel: "3" },
    ]);

    // A step left at the default carries the flag through as false, not
    // merely absent.
    const other = flow.rows.find((r) => r.step.order === 2)!;
    expect(other.step.joinRequiresAll).toBe(false);
  });

  it("accounts for every connection — drawn or back-referenced, none dropped", () => {
    const flow = flowOf(TENDER_STEPS, TENDER_LINKS);
    const backReferenced = new Set(flow.backReferences.map((b) => b.connectionId));
    const drawn = new Set(flow.drawnConnectionIds);

    for (const connection of TENDER_LINKS) {
      expect(
        drawn.has(connection.id) || backReferenced.has(connection.id),
        `connection ${connection.id} is neither drawn nor back-referenced`
      ).toBe(true);
    }
  });

  it("back-references a loop rather than dropping it, keeping its own label", () => {
    const steps = [step(1, "Draft"), step(2, "Review", { kind: "decision" }), step(3, "Publish")];
    const links = [link(1, 2), link(2, 3, "Approved"), link(2, 1, "Rejected")];
    const flow = flowOf(steps, links);

    const back = flow.backReferences.find((b) => b.connectionId === "c2-1");
    expect(back).toBeDefined();
    expect(back!.label).toBe("Rejected");
    expect(back!.toOrder).toBe(1);
    expect(back!.direction).toBe("back");
  });

  it("never indents deeper than the cap, however deeply exceptions nest", () => {
    // Three decisions, each spurring to the next, so the third spur would sit
    // at indent 3 if nothing clamped it — deep enough that the cap is doing
    // real work rather than coinciding with the natural depth.
    const steps = [
      step(1, "A", { kind: "decision" }),
      step(2, "B", { kind: "decision" }),
      step(3, "C", { kind: "decision" }),
      step(4, "Deepest spur"),
      step(5, "C carries on"),
      step(6, "B carries on"),
      step(7, "A carries on"),
    ];
    const links = [
      link(1, 2, "no"),
      link(1, 7, "yes"),
      link(2, 3, "no"),
      link(2, 6, "yes"),
      link(3, 4, "no"),
      link(3, 5, "yes"),
    ];
    const flow = flowOf(steps, links);
    const byOrder = new Map(flow.rows.map((r) => [r.step.order, r]));

    // Without the clamp this is 3 — the nesting genuinely reaches that deep.
    expect(byOrder.get(4)!.indent).toBe(MAX_BRANCH_INDENT);
    for (const row of flow.rows) {
      expect(row.indent).toBeLessThanOrEqual(MAX_BRANCH_INDENT);
    }
  });
});

describe("buildPrintMapLayout — edge cases", () => {
  it("returns an empty outline for a process with no steps", () => {
    const flow = flowOf([], []);
    expect(flow.rows).toEqual([]);
    expect(flow.backReferences).toEqual([]);
  });

  it("handles a single step", () => {
    const flow = flowOf([step(1, "Only")], []);
    expect(flow.rows).toHaveLength(1);
    expect(flow.rows[0]!.rail).toBe("first");
    expect(flow.rows[0]!.endsHere).toBe(true);
  });

  it("keeps a step that has no role, rather than dropping it", () => {
    const flow = flowOf([step(1, "Unowned", { roleName: null })], []);
    expect(flow.rows).toHaveLength(1);
    expect(flow.rows[0]!.step.roleName).toBeNull();
  });

  it("ignores a connection whose other end is not in this process", () => {
    const steps = [step(1, "A"), step(2, "B")];
    const links = [link(1, 2), { id: "stray", fromStepId: "s2", toStepId: "elsewhere", label: null }];
    const flow = flowOf(steps, links);

    expect(flow.rows).toHaveLength(2);
    expect(flow.backReferences.some((b) => b.connectionId === "stray")).toBe(false);
    expect(flow.drawnConnectionIds).not.toContain("stray");
  });

  it("accounts for both of two connections between the same pair", () => {
    const steps = [step(1, "A"), step(2, "B")];
    const links = [link(1, 2, "first"), { id: "dup", fromStepId: "s1", toStepId: "s2", label: "second" }];
    const flow = flowOf(steps, links);

    const seen = new Set([...flow.drawnConnectionIds, ...flow.backReferences.map((b) => b.connectionId)]);
    expect(seen.has("c1-2")).toBe(true);
    expect(seen.has("dup")).toBe(true);
  });

  it("terminates on a cycle", () => {
    const steps = [step(1, "A"), step(2, "B"), step(3, "C")];
    const links = [link(1, 2), link(2, 3), link(3, 1)];
    const flow = flowOf(steps, links);
    expect(flow.rows.map((r) => r.step.order)).toEqual([1, 2, 3]);
  });
});

describe("buildPrintMapLayout — ROLES", () => {
  it("gives a column to each role the process actually uses, in first-appearance order", () => {
    const outcome = buildPrintMapLayout({ steps: TENDER_STEPS, connections: TENDER_LINKS, requested: "ROLES" });
    expect(outcome.layout).toBe("ROLES");
    if (outcome.layout !== "ROLES") return;

    expect(outcome.roles.columns).toEqual(["CEO", "Head of Commercial", "Legal", "Sector Owner"]);
    expect(outcome.roles.cells).toHaveLength(TENDER_STEPS.length);
  });

  it("places every step in its own row, in its role's column", () => {
    const outcome = buildPrintMapLayout({ steps: TENDER_STEPS, connections: TENDER_LINKS, requested: "ROLES" });
    if (outcome.layout !== "ROLES") throw new Error("expected ROLES");

    const legalCell = outcome.roles.cells.find((c) => c.step.order === 8)!;
    expect(outcome.roles.columns[legalCell.column]).toBe("Legal");
    expect(outcome.roles.cells.map((c) => c.row)).toEqual([...Array(10).keys()]);
  });

  it("names a merge the same way Flow does, for the step both paths converge on", () => {
    // Step 9 in TENDER_LINKS is where the Locally/Internationally split
    // (from decision 6) rejoins — the same merge FlowRow.mergesFrom asserts
    // on for this fixture (see the FLOW describe block above).
    const outcome = buildPrintMapLayout({ steps: TENDER_STEPS, connections: TENDER_LINKS, requested: "ROLES" });
    if (outcome.layout !== "ROLES") throw new Error("expected ROLES");

    const merge = outcome.roles.cells.find((c) => c.step.order === 9)!;
    expect(merge.mergesFrom).toEqual([
      { order: 7, label: "Contract drafting", numberLabel: "7" },
      { order: 8, label: "Outsourcing legal firm", numberLabel: "8" },
    ]);

    // No other cell claims to be a merge.
    const others = outcome.roles.cells.filter((c) => c.step.order !== 9);
    expect(others.every((c) => c.mergesFrom.length === 0)).toBe(true);
  });

  it("gives a roleless step a column of its own rather than dropping it", () => {
    const steps = [step(1, "Owned", { roleName: "CEO" }), step(2, "Unowned", { roleName: null })];
    const outcome = buildPrintMapLayout({ steps, connections: [link(1, 2)], requested: "ROLES" });
    if (outcome.layout !== "ROLES") throw new Error("expected ROLES");

    expect(outcome.roles.cells).toHaveLength(2);
    expect(outcome.roles.columns).toHaveLength(2);
  });

  it("falls back to FLOW above the role ceiling, saying why, rather than throwing", () => {
    const steps = Array.from({ length: MAX_ROLE_COLUMNS + 1 }, (_, i) =>
      step(i + 1, `Step ${i + 1}`, { roleName: `Role ${i + 1}` })
    );
    const connections = steps.slice(0, -1).map((_, i) => link(i + 1, i + 2));
    const outcome = buildPrintMapLayout({ steps, connections, requested: "ROLES" });

    expect(outcome.layout).toBe("FLOW");
    if (outcome.layout !== "FLOW") return;
    expect(outcome.fellBackFrom).toBe("ROLES");
    expect(outcome.reason).toContain(String(MAX_ROLE_COLUMNS));
    expect(outcome.flow.rows).toHaveLength(steps.length);
  });

  it("stays in ROLES at exactly the ceiling", () => {
    const steps = Array.from({ length: MAX_ROLE_COLUMNS }, (_, i) =>
      step(i + 1, `Step ${i + 1}`, { roleName: `Role ${i + 1}` })
    );
    const connections = steps.slice(0, -1).map((_, i) => link(i + 1, i + 2));
    const outcome = buildPrintMapLayout({ steps, connections, requested: "ROLES" });
    expect(outcome.layout).toBe("ROLES");
  });
});
