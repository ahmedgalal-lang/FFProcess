import { describe, it, expect } from "vitest";
import {
  buildProcessLandscape,
  describeLandscape,
  COLUMN_SPACING,
  ROW_SPACING,
  type LandscapeInput,
} from "@/lib/domain/process-landscape";

function proc(overrides: Partial<LandscapeInput> & { id: string; code: string }): LandscapeInput {
  return {
    name: overrides.code,
    stepCount: 0,
    parentCode: null,
    branchFrom: null,
    linksTo: [],
    ...overrides,
  };
}

describe("buildProcessLandscape", () => {
  it("returns an empty landscape for a workspace with no processes", () => {
    const landscape = buildProcessLandscape([]);
    expect(landscape.nodes).toEqual([]);
    expect(landscape.edges).toEqual([]);
    expect(landscape.columnCount).toBe(0);
  });

  it("puts unrelated processes in the first column, stacked in code order", () => {
    const landscape = buildProcessLandscape([proc({ id: "b", code: "SAL101" }), proc({ id: "a", code: "PUR101" })]);

    expect(landscape.nodes.map((n) => n.process.code)).toEqual(["PUR101", "SAL101"]);
    expect(landscape.nodes.map((n) => n.column)).toEqual([0, 0]);
    expect(landscape.nodes.map((n) => n.row)).toEqual([0, 1]);
    expect(landscape.nodes[1]!.y).toBe(ROW_SPACING);
  });

  it("places a branching process one column right of the process it resumes from", () => {
    const landscape = buildProcessLandscape([
      proc({ id: "src", code: "PUR101" }),
      proc({ id: "branch", code: "QUA101", branchFrom: { processId: "src", stepLabel: "Approve PO?", stepNumber: 3 } }),
    ]);

    const branch = landscape.nodes.find((n) => n.process.id === "branch")!;
    expect(branch.column).toBe(1);
    expect(branch.x).toBe(COLUMN_SPACING);
  });

  it("describes a branch edge with the source step's number and label", () => {
    const landscape = buildProcessLandscape([
      proc({ id: "src", code: "PUR101", name: "Purchase-to-Pay" }),
      proc({
        id: "branch",
        code: "QUA101",
        name: "Quality Hold",
        branchFrom: { processId: "src", stepLabel: "Approve PO?", stepNumber: 3 },
      }),
    ]);

    expect(landscape.edges).toHaveLength(1);
    const edge = landscape.edges[0]!;
    expect(edge.kind).toBe("branch");
    expect(edge.fromProcessId).toBe("src");
    expect(edge.toProcessId).toBe("branch");
    expect(edge.label).toBe("↰ step 3");
    expect(edge.description).toContain("picks up from step 3, Approve PO?, of PUR101");
  });

  it("collapses several step links to the same process into one connector", () => {
    const landscape = buildProcessLandscape([
      proc({
        id: "a",
        code: "PUR101",
        linksTo: [
          { targetProcessId: "b", fromStepLabel: "Send PO to Vendor" },
          { targetProcessId: "b", fromStepLabel: "Receive Goods" },
        ],
      }),
      proc({ id: "b", code: "PUR102" }),
    ]);

    const links = landscape.edges.filter((e) => e.kind === "link");
    expect(links).toHaveLength(1);
    expect(links[0]!.label).toBe("🔗 ×2");
    expect(links[0]!.description).toContain("Send PO to Vendor, Receive Goods");
  });

  it("ignores links and branches pointing outside the workspace's processes", () => {
    const landscape = buildProcessLandscape([
      proc({
        id: "a",
        code: "PUR101",
        linksTo: [{ targetProcessId: "gone", fromStepLabel: "Send PO" }],
        branchFrom: { processId: "also-gone", stepLabel: "Nowhere", stepNumber: 1 },
      }),
    ]);

    expect(landscape.edges).toEqual([]);
    expect(landscape.nodes[0]!.column).toBe(0);
  });

  it("ignores a step link that points back at its own process", () => {
    const landscape = buildProcessLandscape([
      proc({ id: "a", code: "PUR101", linksTo: [{ targetProcessId: "a", fromStepLabel: "Loop" }] }),
    ]);
    expect(landscape.edges).toEqual([]);
  });

  it("keeps a chain readable left to right", () => {
    const landscape = buildProcessLandscape([
      proc({ id: "a", code: "PUR101", linksTo: [{ targetProcessId: "b", fromStepLabel: "Hand off" }] }),
      proc({ id: "b", code: "PUR102", linksTo: [{ targetProcessId: "c", fromStepLabel: "Hand off" }] }),
      proc({ id: "c", code: "PUR103" }),
    ]);

    const columnOf = new Map(landscape.nodes.map((n) => [n.process.id, n.column]));
    expect(columnOf.get("a")).toBe(0);
    expect(columnOf.get("b")).toBe(1);
    expect(columnOf.get("c")).toBe(2);
    expect(landscape.columnCount).toBe(3);
  });

  it("puts a process to the right of the furthest thing feeding it, not the nearest", () => {
    // c is fed by both a (column 0) and b (column 1), so it belongs in column 2.
    const landscape = buildProcessLandscape([
      proc({
        id: "a",
        code: "PUR101",
        linksTo: [
          { targetProcessId: "b", fromStepLabel: "Hand off" },
          { targetProcessId: "c", fromStepLabel: "Hand off" },
        ],
      }),
      proc({ id: "b", code: "PUR102", linksTo: [{ targetProcessId: "c", fromStepLabel: "Hand off" }] }),
      proc({ id: "c", code: "PUR103" }),
    ]);

    expect(landscape.nodes.find((n) => n.process.id === "c")!.column).toBe(2);
  });

  it("still lays out processes that link to each other in a cycle", () => {
    // Two processes handing work back and forth is real data, not an error —
    // the layout must settle rather than loop forever.
    const landscape = buildProcessLandscape([
      proc({ id: "a", code: "PUR101", linksTo: [{ targetProcessId: "b", fromStepLabel: "Hand off" }] }),
      proc({ id: "b", code: "PUR102", linksTo: [{ targetProcessId: "a", fromStepLabel: "Hand back" }] }),
    ]);

    expect(landscape.nodes).toHaveLength(2);
    expect(landscape.edges.filter((e) => e.kind === "link")).toHaveLength(2);
    for (const node of landscape.nodes) expect(Number.isFinite(node.column)).toBe(true);
  });
});

describe("describeLandscape", () => {
  it("counts processes on their own", () => {
    expect(describeLandscape(buildProcessLandscape([proc({ id: "a", code: "PUR101" })]))).toBe("1 process");
  });

  it("counts branches and links alongside the processes", () => {
    const landscape = buildProcessLandscape([
      proc({ id: "a", code: "PUR101", linksTo: [{ targetProcessId: "b", fromStepLabel: "Hand off" }] }),
      proc({ id: "b", code: "PUR102" }),
      proc({ id: "c", code: "QUA101", branchFrom: { processId: "a", stepLabel: "Approve PO?", stepNumber: 3 } }),
    ]);

    expect(describeLandscape(landscape)).toBe("3 processes · 1 branch · 1 step link");
  });
});
