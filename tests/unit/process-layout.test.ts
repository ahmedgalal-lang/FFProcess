import { describe, expect, it } from "vitest";
import { laneY, nextStepX } from "@/lib/domain/process-layout";

describe("laneY", () => {
  const laneOrder = ["role-ap-clerk", "role-finance-manager", "role-procurement-lead"];

  it("places the first lane role at the top band", () => {
    expect(laneY("role-ap-clerk", laneOrder)).toBe(40 + 65);
  });

  it("places the third lane role in the third band", () => {
    expect(laneY("role-procurement-lead", laneOrder)).toBe(2 * 130 + 40 + 65);
  });

  it("assigns a new, unranked role the next lane after the known ones", () => {
    expect(laneY("role-controller", laneOrder)).toBe(3 * 130 + 40 + 65);
  });

  it("treats a null role the same as an unranked role", () => {
    expect(laneY(null, laneOrder)).toBe(3 * 130 + 40 + 65);
  });
});

describe("nextStepX", () => {
  it("starts at the default first-step position when the map is empty", () => {
    expect(nextStepX([])).toBe(190);
  });

  it("places the next step to the right of the rightmost existing step", () => {
    expect(nextStepX([190, 320, 975])).toBe(975 + 170);
  });
});
