import { describe, it, expect } from "vitest";
import {
  computeStepNumberLabels,
  type NumberingStepInput,
  type NumberingConnectionInput,
} from "@/lib/domain/parallel-step-numbering";

function steps(orders: number[]): NumberingStepInput[] {
  return orders.map((order) => ({ id: `s${order}`, order }));
}

function link(from: number, to: number): NumberingConnectionInput {
  return { fromStepId: `s${from}`, toStepId: `s${to}` };
}

describe("computeStepNumberLabels", () => {
  it("labels a plain process (no joinRequiresAll) as String(order), unchanged", () => {
    const labels = computeStepNumberLabels(steps([1, 2, 3, 4]), [link(1, 2), link(2, 3), link(3, 4)], new Set());
    expect(labels.get("s1")).toBe("1");
    expect(labels.get("s2")).toBe("2");
    expect(labels.get("s3")).toBe("3");
    expect(labels.get("s4")).toBe("4");
  });

  it("letters a contiguous, mutually-unreachable pair feeding a joinRequiresAll step, and continues the sequence after", () => {
    // 1 -> 2, 1 -> 3, 2 -> 4, 3 -> 4 (join). 2 and 3 are both direct
    // predecessors of 4, with no path between them.
    const s = steps([1, 2, 3, 4, 5]);
    const links = [link(1, 2), link(1, 3), link(2, 4), link(3, 4), link(4, 5)];
    const labels = computeStepNumberLabels(s, links, new Set(["s4"]));

    expect(labels.get("s1")).toBe("1");
    expect(labels.get("s2")).toBe("2a");
    expect(labels.get("s3")).toBe("2b");
    expect(labels.get("s4")).toBe("3");
    expect(labels.get("s5")).toBe("4");
  });

  it("letters three or more mutually-unreachable predecessors a/b/c", () => {
    const s = steps([1, 2, 3, 4, 5]);
    const links = [link(1, 2), link(1, 3), link(1, 4), link(2, 5), link(3, 5), link(4, 5)];
    const labels = computeStepNumberLabels(s, links, new Set(["s5"]));

    expect(labels.get("s2")).toBe("2a");
    expect(labels.get("s3")).toBe("2b");
    expect(labels.get("s4")).toBe("2c");
    expect(labels.get("s5")).toBe("3");
  });

  it("excludes a predecessor that has a path to another predecessor in the same set, keeping it plain", () => {
    // 1 -> 2 -> 4 (join), 1 -> 3 -> 4. But 2 -> 3 also exists, so 2 and 3
    // are excluded from each other's group even though both feed 4 directly.
    const s = steps([1, 2, 3, 4]);
    const links = [link(1, 2), link(1, 3), link(2, 3), link(2, 4), link(3, 4)];
    const labels = computeStepNumberLabels(s, links, new Set(["s4"]));

    expect(labels.get("s1")).toBe("1");
    expect(labels.get("s2")).toBe("2");
    expect(labels.get("s3")).toBe("3");
    expect(labels.get("s4")).toBe("4");
  });

  it("falls back to plain numbers when a candidate group is not contiguous in Steps List order", () => {
    // 1 -> 2 -> 5 (join), 1 -> 4 -> 5. 2 and 4 are mutually unreachable
    // direct predecessors of 5, but step 3 sits between them in order.
    const s = steps([1, 2, 3, 4, 5]);
    const links = [link(1, 2), link(1, 4), link(2, 5), link(4, 5)];
    const labels = computeStepNumberLabels(s, links, new Set(["s5"]));

    expect(labels.get("s1")).toBe("1");
    expect(labels.get("s2")).toBe("2");
    expect(labels.get("s3")).toBe("3");
    expect(labels.get("s4")).toBe("4");
    expect(labels.get("s5")).toBe("5");
  });

  it("labels a joinRequiresAll step's single predecessor plainly (no lone letter)", () => {
    const s = steps([1, 2, 3]);
    const links = [link(1, 2), link(2, 3)];
    const labels = computeStepNumberLabels(s, links, new Set(["s3"]));

    expect(labels.get("s2")).toBe("2");
    expect(labels.get("s3")).toBe("3");
  });

  it("letters two independent joinRequiresAll steps' parallel pairs, each from its own base", () => {
    // 1 -> 2, 1 -> 3, both -> 4 (join #1); 4 -> 5, 4 -> 6, both -> 7 (join #2).
    const s = steps([1, 2, 3, 4, 5, 6, 7]);
    const links = [
      link(1, 2),
      link(1, 3),
      link(2, 4),
      link(3, 4),
      link(4, 5),
      link(4, 6),
      link(5, 7),
      link(6, 7),
    ];
    const labels = computeStepNumberLabels(s, links, new Set(["s4", "s7"]));

    expect(labels.get("s1")).toBe("1");
    expect(labels.get("s2")).toBe("2a");
    expect(labels.get("s3")).toBe("2b");
    expect(labels.get("s4")).toBe("3");
    expect(labels.get("s5")).toBe("4a");
    expect(labels.get("s6")).toBe("4b");
    expect(labels.get("s7")).toBe("5");
  });

  it("is cycle-safe: a loop among candidates still terminates and excludes the looped pair", () => {
    const s = steps([1, 2, 3, 4]);
    const links = [link(1, 2), link(1, 3), link(2, 3), link(3, 2), link(2, 4), link(3, 4)];
    const labels = computeStepNumberLabels(s, links, new Set(["s4"]));

    expect(labels.get("s2")).toBe("2");
    expect(labels.get("s3")).toBe("3");
    expect(labels.get("s4")).toBe("4");
  });
});
