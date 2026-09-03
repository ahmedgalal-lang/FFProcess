import { describe, expect, it } from "vitest";
import {
  assignSwimlanes,
  laneIndexAtY,
  laneY,
  nextStepX,
  roleIdForLane,
  LANE_HEIGHT,
  LANE_TOP_OFFSET,
  LANE_NODE_Y_OFFSET,
  FIRST_STEP_X,
  STEP_X_SPACING,
} from "@/lib/domain/process-layout";

describe("laneY", () => {
  const laneOrder = ["role-ap-clerk", "role-finance-manager", "role-procurement-lead"];

  it("places the first lane role at the top band", () => {
    expect(laneY("role-ap-clerk", laneOrder)).toBe(LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET);
  });

  it("places the third lane role in the third band", () => {
    expect(laneY("role-procurement-lead", laneOrder)).toBe(2 * LANE_HEIGHT + LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET);
  });

  it("assigns a new, unranked role the next lane after the known ones", () => {
    expect(laneY("role-controller", laneOrder)).toBe(3 * LANE_HEIGHT + LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET);
  });

  it("treats a null role the same as an unranked role", () => {
    expect(laneY(null, laneOrder)).toBe(3 * LANE_HEIGHT + LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET);
  });
});

describe("nextStepX", () => {
  it("starts at the default first-step position when the map is empty", () => {
    expect(nextStepX([])).toBe(FIRST_STEP_X);
  });

  it("places the next step to the right of the rightmost existing step", () => {
    expect(nextStepX([190, 320, 975])).toBe(975 + STEP_X_SPACING);
  });
});

describe("assignSwimlanes", () => {
  const step = (id: string, assigned: string | null, swimlane: string | null = null) => ({
    id,
    assignedRoleId: assigned,
    swimlaneRoleId: swimlane,
  });

  it("orders lanes by where each role first appears", () => {
    const layout = assignSwimlanes([step("s1", "geo"), step("s2", "auditing"), step("s3", "geo")]);
    expect(layout.laneOrder).toEqual(["geo", "auditing"]);
    expect(layout.laneCount).toBe(2);
  });

  it("puts every step in its own role's lane, not the first one", () => {
    // The bug this exists for: a step whose role was set after it was created
    // stayed in whichever lane existed at the time.
    const layout = assignSwimlanes([step("s1", "geo"), step("s2", "auditing"), step("s3", "cco")]);

    expect(layout.laneIndexOf.get("s1")).toBe(0);
    expect(layout.laneIndexOf.get("s2")).toBe(1);
    expect(layout.laneIndexOf.get("s3")).toBe(2);
    expect(layout.yOf.get("s2")).toBe(LANE_HEIGHT + LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET);
  });

  it("lets an explicit swimlane role override the assigned one", () => {
    const layout = assignSwimlanes([step("s1", "geo"), step("s2", "geo", "auditing")]);
    expect(layout.laneOrder).toEqual(["geo", "auditing"]);
    expect(layout.laneIndexOf.get("s2")).toBe(1);
  });

  it("adds a lane at the bottom for steps with no role at all", () => {
    const layout = assignSwimlanes([step("s1", "geo"), step("s2", null)]);
    expect(layout.hasUnassignedLane).toBe(true);
    expect(layout.laneCount).toBe(2);
    expect(layout.laneIndexOf.get("s2")).toBe(1);
  });

  it("draws no unassigned lane when every step has a role", () => {
    const layout = assignSwimlanes([step("s1", "geo"), step("s2", "auditing")]);
    expect(layout.hasUnassignedLane).toBe(false);
    expect(layout.laneCount).toBe(2);
  });

  it("handles a process with no steps", () => {
    const layout = assignSwimlanes([]);
    expect(layout.laneOrder).toEqual([]);
    expect(layout.laneCount).toBe(0);
    expect(layout.hasUnassignedLane).toBe(false);
  });

  it("agrees with laneY, which places a single new step", () => {
    const layout = assignSwimlanes([step("s1", "geo"), step("s2", "auditing")]);
    expect(layout.yOf.get("s2")).toBe(laneY("auditing", layout.laneOrder));
  });
});

describe("laneIndexAtY", () => {
  it("reads a drop inside a lane's band as that lane", () => {
    expect(laneIndexAtY(LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET, 3)).toBe(0);
    expect(laneIndexAtY(LANE_HEIGHT + LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET, 3)).toBe(1);
  });

  it("keeps a small wobble inside the same lane", () => {
    const centre = LANE_TOP_OFFSET + LANE_NODE_Y_OFFSET;
    expect(laneIndexAtY(centre - 20, 3)).toBe(0);
    expect(laneIndexAtY(centre + 20, 3)).toBe(0);
  });

  it("clamps a drop above the first lane or below the last", () => {
    expect(laneIndexAtY(-500, 3)).toBe(0);
    expect(laneIndexAtY(5000, 3)).toBe(2);
  });

  it("stays at zero when there are no lanes yet", () => {
    expect(laneIndexAtY(400, 0)).toBe(0);
  });
});

describe("roleIdForLane", () => {
  it("names the role a lane belongs to", () => {
    expect(roleIdForLane(1, ["geo", "auditing"])).toBe("auditing");
  });

  it("returns null for the unassigned lane past the end", () => {
    expect(roleIdForLane(2, ["geo", "auditing"])).toBeNull();
  });
});
