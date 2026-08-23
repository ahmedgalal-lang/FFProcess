import { describe, it, expect } from "vitest";
import { wouldCreateManagerCycle, layoutOrgChart, type ChartPerson } from "@/lib/domain/org-chart";

describe("wouldCreateManagerCycle", () => {
  it("allows setting a manager with no existing chain", () => {
    const managerOf = new Map<string, string | null>([["a", null]]);
    expect(wouldCreateManagerCycle("a", "b", managerOf)).toBe(false);
  });

  it("rejects making someone their own manager", () => {
    const managerOf = new Map<string, string | null>([["a", null]]);
    expect(wouldCreateManagerCycle("a", "a", managerOf)).toBe(true);
  });

  it("rejects making a report into their own manager's manager (a 2-cycle)", () => {
    // b already reports to a; setting a's manager to b would loop.
    const managerOf = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
    ]);
    expect(wouldCreateManagerCycle("a", "b", managerOf)).toBe(true);
  });

  it("allows a longer, non-cyclic chain", () => {
    const managerOf = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
      ["c", "b"],
    ]);
    expect(wouldCreateManagerCycle("d", "c", managerOf)).toBe(false);
  });
});

describe("layoutOrgChart", () => {
  it("places a lone person with no manager at depth 0", () => {
    const people: ChartPerson[] = [{ id: "a", name: "Alice", managerId: null }];
    const positions = layoutOrgChart(people);
    expect(positions).toEqual([{ id: "a", x: 0, y: 0, depth: 0 }]);
  });

  it("places a direct report one level below their manager", () => {
    const people: ChartPerson[] = [
      { id: "a", name: "Alice", managerId: null },
      { id: "b", name: "Bob", managerId: "a" },
    ];
    const positions = layoutOrgChart(people);
    const alice = positions.find((p) => p.id === "a")!;
    const bob = positions.find((p) => p.id === "b")!;
    expect(alice.depth).toBe(0);
    expect(bob.depth).toBe(1);
  });

  it("centers a manager above the midpoint of their reports", () => {
    const people: ChartPerson[] = [
      { id: "mgr", name: "Manager", managerId: null },
      { id: "r1", name: "Report A", managerId: "mgr" },
      { id: "r2", name: "Report B", managerId: "mgr" },
    ];
    const positions = layoutOrgChart(people);
    const byId = new Map(positions.map((p) => [p.id, p]));
    expect(byId.get("mgr")!.x).toBe((byId.get("r1")!.x + byId.get("r2")!.x) / 2);
  });

  it("treats someone whose manager isn't in the given set as a root", () => {
    // e.g. their manager was archived and dropped from the active roster.
    const people: ChartPerson[] = [{ id: "a", name: "Alice", managerId: "gone" }];
    const positions = layoutOrgChart(people);
    expect(positions[0]).toEqual({ id: "a", x: 0, y: 0, depth: 0 });
  });

  it("never infinite-loops on a stale cyclic chain and still places everyone once", () => {
    const people: ChartPerson[] = [
      { id: "a", name: "Alice", managerId: "b" },
      { id: "b", name: "Bob", managerId: "a" },
    ];
    const positions = layoutOrgChart(people);
    expect(positions).toHaveLength(2);
    expect(new Set(positions.map((p) => p.id))).toEqual(new Set(["a", "b"]));
  });

  it("handles an empty roster", () => {
    expect(layoutOrgChart([])).toEqual([]);
  });
});
