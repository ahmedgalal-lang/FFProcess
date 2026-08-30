import { describe, expect, it } from "vitest";
import {
  generateProcessCode,
  isCodeAvailable,
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
