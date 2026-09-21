import { describe, expect, it } from "vitest";
import {
  generateProcessCode,
  isCodeAvailable,
  orderProcessTree,
  wouldCreateBranchCycle,
  wouldCreateCycle,
} from "@/lib/domain/process-hierarchy";

describe("isCodeAvailable", () => {
  it("is available when no other process uses it", () => {
    expect(isCodeAvailable("SAL101", ["PUR101", "PUR102"])).toBe(true);
  });

  it("is unavailable when already used, case-insensitively", () => {
    expect(isCodeAvailable("sal101", ["SAL101"])).toBe(false);
  });
});

describe("generateProcessCode", () => {
  it("derives a top-level code from the first word of the name, starting at 100", () => {
    expect(generateProcessCode({ name: "Sales Order Fulfillment", parentCode: null, existingCodes: [] })).toBe(
      "SAL100"
    );
  });

  it("increments past the highest existing number sharing that prefix", () => {
    expect(
      generateProcessCode({ name: "Sales Returns", parentCode: null, existingCodes: ["SAL100", "SAL101", "PUR100"] })
    ).toBe("SAL102");
  });

  it("ignores gaps and only looks at the maximum, not the count", () => {
    expect(generateProcessCode({ name: "Sales Returns", parentCode: null, existingCodes: ["SAL100", "SAL105"] })).toBe(
      "SAL106"
    );
  });

  it("inherits the parent's alphabetic prefix for a sub-process, regardless of its own name", () => {
    expect(
      generateProcessCode({ name: "Vendor Onboarding", parentCode: "PUR100", existingCodes: ["PUR100"] })
    ).toBe("PUR101");
  });

  it("continues numbering under the parent's prefix across existing siblings", () => {
    expect(
      generateProcessCode({ name: "Another Step", parentCode: "PUR100", existingCodes: ["PUR100", "PUR101", "PUR102"] })
    ).toBe("PUR103");
  });

  it("pads a short first word out to a 3-letter prefix", () => {
    expect(generateProcessCode({ name: "IT Support", parentCode: null, existingCodes: [] })).toBe("ITX100");
  });

  it("strips non-letters from the first word", () => {
    expect(generateProcessCode({ name: "3PL Fulfillment", parentCode: null, existingCodes: [] })).toBe("PLX100");
  });

  it("is case-insensitive when scanning existing codes for the next number", () => {
    expect(generateProcessCode({ name: "Sales Returns", parentCode: null, existingCodes: ["sal100"] })).toBe(
      "SAL101"
    );
  });
});

describe("wouldCreateCycle", () => {
  it("allows setting a parent with no ancestry conflict", () => {
    const parentOf = new Map([
      ["PUR101", null],
      ["PUR102", null],
    ]);
    expect(wouldCreateCycle("PUR102", "PUR101", parentOf)).toBe(false);
  });

  it("blocks a process from being its own parent", () => {
    const parentOf = new Map([["PUR101", null]]);
    expect(wouldCreateCycle("PUR101", "PUR101", parentOf)).toBe(true);
  });

  it("blocks a process from being set as a descendant's parent (indirect cycle)", () => {
    // PUR100 -> PUR101 -> PUR102 (PUR102's parent is PUR101, PUR101's parent is PUR100)
    const parentOf = new Map([
      ["PUR100", null],
      ["PUR101", "PUR100"],
      ["PUR102", "PUR101"],
    ]);
    // Attempting to set PUR100's parent to PUR102 would create a cycle
    expect(wouldCreateCycle("PUR100", "PUR102", parentOf)).toBe(true);
  });

  it("allows a deep, non-cyclical hierarchy", () => {
    const parentOf = new Map([
      ["PUR100", null],
      ["PUR101", "PUR100"],
      ["PUR102", null],
    ]);
    expect(wouldCreateCycle("PUR102", "PUR101", parentOf)).toBe(false);
  });
});

describe("wouldCreateBranchCycle", () => {
  it("is true when a process would branch off its own step", () => {
    expect(wouldCreateBranchCycle("a", "a", new Map())).toBe(true);
  });

  it("is false for a process branching off an independent one", () => {
    const branchSourceOf = new Map<string, string | null>([["b", null]]);
    expect(wouldCreateBranchCycle("a", "b", branchSourceOf)).toBe(false);
  });

  it("is true when the chain leads back to the process", () => {
    // b already branches from a, so branching a off b closes the loop.
    const branchSourceOf = new Map<string, string | null>([["b", "a"], ["a", null]]);
    expect(wouldCreateBranchCycle("a", "b", branchSourceOf)).toBe(true);
  });

  it("follows a longer chain before deciding", () => {
    const branchSourceOf = new Map<string, string | null>([
      ["d", "c"],
      ["c", "b"],
      ["b", "a"],
      ["a", null],
    ]);
    expect(wouldCreateBranchCycle("a", "d", branchSourceOf)).toBe(true);
    expect(wouldCreateBranchCycle("e", "d", branchSourceOf)).toBe(false);
  });

  it("terminates on a pre-existing cycle in the data rather than looping forever", () => {
    const branchSourceOf = new Map<string, string | null>([["x", "y"], ["y", "x"]]);
    expect(wouldCreateBranchCycle("z", "x", branchSourceOf)).toBe(true);
  });
});

describe("orderProcessTree", () => {
  const p = (id: string, parentProcessId: string | null = null) => ({ id, parentProcessId });

  it("lists a top-level process followed by its children", () => {
    const rows = orderProcessTree([p("child", "parent"), p("parent")]);
    expect(rows.map((r) => r.process.id)).toEqual(["parent", "child"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1]);
  });

  it("lists a process nested deeper than one level", () => {
    // The reported bug: a sub-process of a sub-process was built as a
    // two-level tree — top-level processes, each followed by its direct
    // children — so a grandchild was in none of the buckets and silently
    // vanished from the list. It could still be found by searching, because
    // search skips the grouping and shows every match flat, which is exactly
    // how it was noticed: "it's not displayed, I have to search for it."
    const rows = orderProcessTree([p("grandchild", "child"), p("child", "parent"), p("parent")]);
    expect(rows.map((r) => r.process.id)).toEqual(["parent", "child", "grandchild"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2]);
  });

  it("loses nothing, however deep or however it was ordered coming in", () => {
    const deep = [
      p("e", "d"), p("c", "b"), p("a"), p("d", "c"), p("b", "a"),
      p("other"), p("other-child", "other"),
    ];
    const rows = orderProcessTree(deep);
    expect(rows).toHaveLength(deep.length);
    expect(new Set(rows.map((r) => r.process.id)).size).toBe(deep.length);
  });

  it("lists a process whose parent is not in the list, in its own place among the roots", () => {
    // A child whose parent was deleted, or filtered out by a category — it
    // has nowhere to nest, so it stands on its own rather than disappearing.
    // Its position matters too: the list is ordered by code, so an orphan
    // belongs where its code puts it, not exiled to the bottom of the page
    // where a reader scanning alphabetically would never look for it.
    const rows = orderProcessTree([p("orphan", "missing"), p("top"), p("kid", "top")]);
    expect(rows.map((r) => r.process.id)).toEqual(["orphan", "top", "kid"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 0, 1]);
  });

  it("puts a parent before its children even when the input is reversed", () => {
    const rows = orderProcessTree([p("c", "b"), p("b", "a"), p("a")]);
    expect(rows.map((r) => r.process.id)).toEqual(["a", "b", "c"]);
  });

  it("terminates and loses nothing on a cycle in the data", () => {
    // Cycles are guarded at write time, but a list that hangs the page is a
    // worse failure than one that draws a cycle oddly.
    const rows = orderProcessTree([p("x", "y"), p("y", "x"), p("free")]);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.process.id)).size).toBe(3);
  });

  it("keeps the order it was given among siblings", () => {
    const rows = orderProcessTree([p("top"), p("b", "top"), p("a", "top")]);
    expect(rows.map((r) => r.process.id)).toEqual(["top", "b", "a"]);
  });
});
