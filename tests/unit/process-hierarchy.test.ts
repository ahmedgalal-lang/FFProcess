import { describe, expect, it } from "vitest";
import { isCodeAvailable, wouldCreateCycle } from "@/lib/domain/process-hierarchy";

describe("isCodeAvailable", () => {
  it("is available when no other process uses it", () => {
    expect(isCodeAvailable("SAL101", ["PUR101", "PUR102"])).toBe(true);
  });

  it("is unavailable when already used, case-insensitively", () => {
    expect(isCodeAvailable("sal101", ["SAL101"])).toBe(false);
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
