import { describe, expect, it } from "vitest";
import {
  assignSwimlanes,
  crossRowMarkers,
  isSeamConnection,
  MIN_ROW_CAPACITY,
  PRINT_LANE_HEIGHT,
  PRINT_STEP_X_SPACING,
  WRAPPED_ROW_GAP,
  shortRoleName,
  CARD_ROLE_BUDGET,
  wrapProcessMap,
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

/**
 * Wrapping a long process map.
 *
 * The report draws a process as one row of steps and shrinks it to fit. At 22
 * steps that is about a centimetre per step on A4 — complete, and unreadable.
 * These cover the arithmetic that deals the steps into rows instead: how many
 * fit, which row each lands on, which lanes a row needs, and which connections
 * end up crossing a boundary.
 */
describe("wrapProcessMap — capacity and rows", () => {
  const steps = (n: number, role: string | null = "r1") =>
    Array.from({ length: n }, (_, i) => ({
      id: `s${i + 1}`,
      assignedRoleId: role,
      swimlaneRoleId: null,
      positionX: FIRST_STEP_X + i * STEP_X_SPACING,
      positionY: 0,
    }));

  const opts = (boxWidth: number) => ({ boxWidth, laneLabel: (id: string | null) => id ?? "Unassigned" });

  it("fits as many steps per row as the box width allows", () => {
    // 262px a step; a 1400px box takes five.
    expect(wrapProcessMap(steps(20), opts(1400)).capacity).toBe(5);
    expect(wrapProcessMap(steps(20), opts(800)).capacity).toBe(3);
  });

  it("never drops below two steps a row, however narrow the box", () => {
    // One step per row is a column, not a map.
    expect(wrapProcessMap(steps(10), opts(100)).capacity).toBe(2);
    expect(wrapProcessMap(steps(10), opts(0)).capacity).toBe(2);
    expect(wrapProcessMap(steps(10), opts(-500)).capacity).toBe(2);
  });

  it("does not wrap a process that fits one row", () => {
    const layout = wrapProcessMap(steps(5), opts(1400));
    expect(layout.wrapped).toBe(false);
    expect(layout.rows).toHaveLength(1);
  });

  it("wraps as soon as there is one step too many", () => {
    expect(wrapProcessMap(steps(5), opts(1400)).wrapped).toBe(false);
    expect(wrapProcessMap(steps(6), opts(1400)).wrapped).toBe(true);
  });

  it("deals steps into full rows with the remainder last", () => {
    const layout = wrapProcessMap(steps(12), opts(1400)); // capacity 5
    expect(layout.rows.map((r) => r.steps.length)).toEqual([5, 5, 2]);
  });

  it("draws every step exactly once", () => {
    const layout = wrapProcessMap(steps(22), opts(1400));
    const ids = layout.rows.flatMap((r) => r.steps.map((s) => s.id));
    expect(ids).toHaveLength(22);
    expect(new Set(ids).size).toBe(22);
  });

  it("takes the order the steps are already in, not the order they arrived", () => {
    // Shuffled input, deliberate positions: the map must read left to right.
    const shuffled = [
      { id: "third", assignedRoleId: "r1", swimlaneRoleId: null, positionX: 900, positionY: 0 },
      { id: "first", assignedRoleId: "r1", swimlaneRoleId: null, positionX: 100, positionY: 0 },
      { id: "second", assignedRoleId: "r1", swimlaneRoleId: null, positionX: 500, positionY: 0 },
    ];
    const layout = wrapProcessMap(shuffled, opts(1400));
    expect(layout.rows[0]!.steps.map((s) => s.id)).toEqual(["first", "second", "third"]);
  });

  it("breaks a tie on position with the id, so the layout is stable", () => {
    const tied = ["b", "a"].map((id) => ({
      id, assignedRoleId: "r1", swimlaneRoleId: null, positionX: 100, positionY: 0,
    }));
    expect(wrapProcessMap(tied, opts(1400)).rows[0]!.steps.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("puts one step per column, centred, at whatever spacing it was given", () => {
    // The inset is half a column rather than the interactive map's fixed
    // FIRST_STEP_X: that constant is sized for a 214px card, and print draws a
    // 130px one. Half a column centres the card whatever size it is.
    const layout = wrapProcessMap(steps(12), opts(1400));
    const columnX = (c: number) => STEP_X_SPACING / 2 + c * STEP_X_SPACING;
    expect(layout.rows[0]!.steps.map((s) => s.x)).toEqual([0, 1, 2, 3, 4].map(columnX));
    // The second row runs the other way, so it occupies the same columns in
    // the opposite order.
    expect(layout.rows[1]!.steps.map((s) => s.x)).toEqual([4, 3, 2, 1, 0].map(columnX));
  });

  it("runs alternate rows backwards, so each begins under where the last ended", () => {
    const layout = wrapProcessMap(steps(12), opts(1400));
    expect(layout.rows.map((r) => r.direction)).toEqual(["forward", "backward", "forward"]);

    for (let i = 0; i < layout.rows.length - 1; i++) {
      const ends = layout.rows[i]!.steps.at(-1)!;
      const begins = layout.rows[i + 1]!.steps[0]!;
      expect(begins.column, `row ${i + 2} begins under where row ${i + 1} ended`).toBe(ends.column);
      expect(begins.x).toBe(ends.x);
    }
  });

  it("starts a short BACKWARD final row under the step above it, not at its own far end", () => {
    // The row has to be both short and backward, which is fussier than it
    // sounds: 11 steps at a capacity of 5 leaves a final row of one, but that
    // row is index 2 and so runs forward — it never touches the reversing
    // branch at all. A mutation that reversed within the row's own length
    // instead of the full capacity passed the whole suite because of it.
    // 7 steps gives rows of 5 and 2, and the short one is backward.
    const layout = wrapProcessMap(steps(7), opts(1400));
    const last = layout.rows.at(-1)!;
    const previous = layout.rows.at(-2)!;

    expect(layout.capacity).toBe(5);
    expect(last.direction).toBe("backward");
    expect(last.steps).toHaveLength(2);

    // It begins in column 4 — under the step above — and works left to 3,
    // rather than beginning at column 1 because it happens to be two long.
    expect(last.steps[0]!.column).toBe(previous.steps.at(-1)!.column);
    expect(last.steps.map((s) => s.column)).toEqual([4, 3]);
  });

  it("uses the compact print geometry when it is given it", () => {
    const layout = wrapProcessMap(steps(22), {
      boxWidth: 1030,
      laneLabel: () => "",
      stepSpacing: PRINT_STEP_X_SPACING,
      laneHeight: PRINT_LANE_HEIGHT,
    });
    // Six a row instead of three, so four rows instead of eight — which is the
    // whole reason the compact card exists.
    expect(layout.capacity).toBe(6);
    expect(layout.rows).toHaveLength(4);
    expect(layout.rows[0]!.height).toBe(PRINT_LANE_HEIGHT);
  });
});

describe("wrapProcessMap — a row's own lanes", () => {
  const opts = { boxWidth: 1400, laneLabel: (id: string | null) => id ?? "Unassigned" };
  const step = (id: string, role: string | null, x: number) => ({
    id, assignedRoleId: role, swimlaneRoleId: null, positionX: x, positionY: 0,
  });

  it("gives a row only the lanes its own steps need", () => {
    // Capacity 5: first row all r1, second row all r2.
    const steps = [
      ...["a", "b", "c", "d", "e"].map((id, i) => step(id, "r1", i * 100)),
      ...["f", "g", "h"].map((id, i) => step(id, "r2", 500 + i * 100)),
    ];
    const layout = wrapProcessMap(steps, opts);
    expect(layout.rows[0]!.lanes.map((l) => l.roleId)).toEqual(["r1"]);
    expect(layout.rows[1]!.lanes.map((l) => l.roleId)).toEqual(["r2"]);
  });

  it("keeps lanes in the same relative order on every row they appear on", () => {
    const steps = [
      step("a", "r2", 0), step("b", "r1", 100), step("c", "r2", 200),
      step("d", "r1", 300), step("e", "r2", 400),
      step("f", "r1", 500), step("g", "r2", 600),
    ];
    const layout = wrapProcessMap(steps, opts);
    // r2 is seen first across the process, so it is the upper lane everywhere.
    for (const row of layout.rows) {
      expect(row.lanes.map((l) => l.roleId)).toEqual(["r2", "r1"].filter((r) => row.lanes.some((l) => l.roleId === r)));
    }
  });

  it("puts the Unassigned lane only on rows that have a roleless step", () => {
    const steps = [
      ...["a", "b", "c", "d", "e"].map((id, i) => step(id, "r1", i * 100)),
      step("f", null, 500), step("g", "r1", 600),
    ];
    const layout = wrapProcessMap(steps, opts);
    expect(layout.rows[0]!.lanes.some((l) => l.roleId === null)).toBe(false);
    expect(layout.rows[1]!.lanes.some((l) => l.roleId === null)).toBe(true);
  });

  it("gives a row the height of the lanes it actually carries", () => {
    const steps = [
      ...["a", "b", "c", "d", "e"].map((id, i) => step(id, "r1", i * 100)),
      step("f", "r1", 500), step("g", "r2", 600),
    ];
    const layout = wrapProcessMap(steps, opts);
    expect(layout.rows[0]!.height).toBe(LANE_HEIGHT);
    expect(layout.rows[1]!.height).toBe(LANE_HEIGHT * 2);
  });

  it("places a step in its own lane within its own row", () => {
    const steps = [
      ...["a", "b", "c", "d", "e"].map((id, i) => step(id, "r1", i * 100)),
      step("f", "r2", 500), step("g", "r1", 600),
    ];
    const layout = wrapProcessMap(steps, opts);
    const row = layout.rows[1]!;
    const f = row.steps.find((s) => s.id === "f")!;
    const g = row.steps.find((s) => s.id === "g")!;
    expect(row.lanes[f.laneIndex]!.roleId).toBe("r2");
    expect(row.lanes[g.laneIndex]!.roleId).toBe("r1");
  });
});

describe("crossRowMarkers", () => {
  const opts = { boxWidth: 1400, laneLabel: (id: string | null) => id ?? "Unassigned" };
  const steps = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i + 1}`, assignedRoleId: "r1", swimlaneRoleId: null,
    positionX: i * 100, positionY: 0,
  }));
  const layout = () => wrapProcessMap(steps, opts); // capacity 5 → rows of 5, 5, 2

  it("says nothing about a connection inside one row", () => {
    expect(crossRowMarkers(layout(), [{ fromStepId: "s1", toStepId: "s2" }])).toEqual([]);
  });

  it("leaves the seam alone — it is drawn, so marking it would say it twice", () => {
    // s5 ends row 1 and s6 begins row 2, directly beneath it. That line can be
    // drawn, which is the whole point of running the rows serpentine.
    expect(crossRowMarkers(layout(), [{ fromStepId: "s5", toStepId: "s6" }])).toEqual([]);
    expect(isSeamConnection(layout(), { fromStepId: "s5", toStepId: "s6" })).toBe(true);

    const [marker] = crossRowMarkers(layout(), [{ fromStepId: "s10", toStepId: "s11" }]);
    expect(marker, "the row-2 to row-3 seam is drawn too").toBeUndefined();
  });

  it("still marks a connection that jumps rows anywhere but the seam", () => {
    // s5 is the last of row 1; s11 is the first of row 3. A line between them
    // would travel through row 2's swimlanes, so it stays a pair of markers.
    const markers = crossRowMarkers(layout(), [{ fromStepId: "s5", toStepId: "s11" }]);
    expect(markers).toHaveLength(2);
    expect(markers).toContainEqual({ stepId: "s5", kind: "continues", otherRow: 3 });
    expect(markers).toContainEqual({ stepId: "s11", kind: "from", otherRow: 1 });
    expect(isSeamConnection(layout(), { fromStepId: "s5", toStepId: "s11" })).toBe(false);
  });

  it("marks the branch of a decision that leaves the seam, and draws the one that follows it", () => {
    const markers = crossRowMarkers(layout(), [
      { fromStepId: "s5", toStepId: "s6" },
      { fromStepId: "s5", toStepId: "s11" },
    ]);
    // Only the far branch is marked; the seam branch is a drawn line.
    expect(markers.filter((m) => m.stepId === "s5")).toHaveLength(1);
    expect(markers.filter((m) => m.stepId === "s11")).toHaveLength(1);
    expect(markers.filter((m) => m.stepId === "s6")).toHaveLength(0);
  });

  it("ignores a connection naming a step that is not on the map", () => {
    expect(crossRowMarkers(layout(), [{ fromStepId: "s1", toStepId: "ghost" }])).toEqual([]);
  });
});

describe("wrapProcessMap — never throws", () => {
  const opts = { boxWidth: 1400, laneLabel: () => "" };

  it("handles an empty process", () => {
    const layout = wrapProcessMap([], opts);
    expect(layout.rows).toEqual([]);
    expect(layout.wrapped).toBe(false);
  });

  it("handles a single step without wrapping it", () => {
    const layout = wrapProcessMap(
      [{ id: "only", assignedRoleId: null, swimlaneRoleId: null, positionX: 0, positionY: 0 }],
      opts
    );
    expect(layout.wrapped).toBe(false);
    expect(layout.rows[0]!.steps).toHaveLength(1);
  });

  it("survives nonsense box widths", () => {
    for (const boxWidth of [0, -1, NaN, Infinity]) {
      expect(() =>
        wrapProcessMap(
          [{ id: "a", assignedRoleId: null, swimlaneRoleId: null, positionX: 0, positionY: 0 }],
          { boxWidth, laneLabel: () => "" }
        )
      ).not.toThrow();
    }
  });
});

describe("wrapProcessMap — the capacity floor is load-bearing", () => {
  /**
   * Row count is derived by dividing by capacity, so a capacity of zero does
   * not produce a bad layout — it produces an infinite one. A mutation that
   * removed the clamp hung the test runner rather than failing it, which on a
   * report page would be a hung request rather than an error anybody sees.
   * The invariant is asserted directly rather than at three sample widths.
   */
  it("never returns a capacity below the floor, at any box width", () => {
    const widths = [-10000, -1, 0, 1, 50, 261, 262, 263, 1000, 1e9, NaN, Infinity, -Infinity];
    for (const boxWidth of widths) {
      const layout = wrapProcessMap(
        [{ id: "a", assignedRoleId: null, swimlaneRoleId: null, positionX: 0, positionY: 0 }],
        { boxWidth, laneLabel: () => "" }
      );
      expect(layout.capacity, `boxWidth ${boxWidth}`).toBeGreaterThanOrEqual(MIN_ROW_CAPACITY);
    }
  });

  it("produces a finite number of rows for every one of those widths", () => {
    const steps = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`, assignedRoleId: null, swimlaneRoleId: null, positionX: i, positionY: 0,
    }));
    for (const boxWidth of [-1, 0, 1, NaN, Infinity]) {
      const layout = wrapProcessMap(steps, { boxWidth, laneLabel: () => "" });
      expect(layout.rows.length).toBeLessThanOrEqual(steps.length);
      expect(layout.rows.flatMap((r) => r.steps)).toHaveLength(steps.length);
    }
  });
});

describe("wrapProcessMap — rows do not sit flush", () => {
  /**
   * A lane's label is drawn above its band, so rows stacked flush put the
   * first label of one row on top of the last lane of the row before it — it
   * came out clipped in half on a real export.
   */
  const steps = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`, assignedRoleId: "r1", swimlaneRoleId: null, positionX: i, positionY: 0,
  }));

  it("leaves a gap between one row and the next", () => {
    const layout = wrapProcessMap(steps, { boxWidth: 1400, laneLabel: () => "" });
    const [first, second] = layout.rows;
    expect(second!.y).toBe(first!.y + first!.height + WRAPPED_ROW_GAP);
  });

  it("does not leave a gap hanging off the bottom", () => {
    const layout = wrapProcessMap(steps, { boxWidth: 1400, laneLabel: () => "" });
    const last = layout.rows[layout.rows.length - 1]!;
    expect(layout.height).toBe(last.y + last.height);
  });
});

describe("shortRoleName", () => {
  it("leaves a name that already fits alone", () => {
    expect(shortRoleName("SECTOR OWNER")).toBe("SECTOR OWNER");
    expect(shortRoleName("CEO")).toBe("CEO");
  });

  it("cuts a long name on a word boundary", () => {
    // Four lines on a card whose own step name is one line.
    expect(shortRoleName("HEAD OF COMMERCIAL AND BUSINESS DEVELOPMENT")).toBe("HEAD OF COMMERCIAL…");
  });

  it("never returns more than the budget plus the ellipsis", () => {
    for (const name of [
      "HEAD OF COMMERCIAL AND BUSINESS DEVELOPMENT",
      "GLOBAL PROCUREMENT AND SUPPLY CHAIN DIRECTOR",
      "A B C D E F G H I J K L M N O P Q R S T U V",
    ]) {
      expect(shortRoleName(name).length).toBeLessThanOrEqual(CARD_ROLE_BUDGET + 1);
    }
  });

  it("cuts mid-word only when one word is longer than the whole budget", () => {
    const out = shortRoleName("SUPERCALIFRAGILISTICEXPIALIDOCIOUS");
    expect(out).toBe("SUPERCALIFRAGILISTIC…");
    expect(out.length).toBe(CARD_ROLE_BUDGET + 1);
  });

  it("tolerates whitespace and an empty name", () => {
    expect(shortRoleName("   SECTOR OWNER  ")).toBe("SECTOR OWNER");
    expect(shortRoleName("")).toBe("");
  });
});
