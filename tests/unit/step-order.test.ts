import { describe, it, expect } from "vitest";
import {
  moveStepInOrder,
  insertPositionAfter,
  insertStepAt,
  arrangeByFlow,
} from "@/lib/domain/step-order";

describe("moveStepInOrder", () => {
  it("swaps a step with the one above it", () => {
    expect(moveStepInOrder(["a", "b", "c"], "c", "UP")).toEqual(["a", "c", "b"]);
  });

  it("swaps a step with the one below it", () => {
    expect(moveStepInOrder(["a", "b", "c"], "a", "DOWN")).toEqual(["b", "a", "c"]);
  });

  it("leaves the first step alone when moved up, and the last when moved down", () => {
    expect(moveStepInOrder(["a", "b"], "a", "UP")).toEqual(["a", "b"]);
    expect(moveStepInOrder(["a", "b"], "b", "DOWN")).toEqual(["a", "b"]);
  });

  it("leaves the list alone for a step that isn't in it", () => {
    expect(moveStepInOrder(["a", "b"], "gone", "UP")).toEqual(["a", "b"]);
  });
});

describe("insertPositionAfter", () => {
  it("puts a step straight after the one named", () => {
    expect(insertPositionAfter(["a", "b", "c"], "a")).toBe(1);
    expect(insertPositionAfter(["a", "b", "c"], "c")).toBe(3);
  });

  it("appends when nothing is named", () => {
    expect(insertPositionAfter(["a", "b"], null)).toBe(2);
  });

  it("appends rather than failing when the named step has since gone", () => {
    expect(insertPositionAfter(["a", "b"], "gone")).toBe(2);
  });
});

describe("insertStepAt", () => {
  it("inserts into the middle, shifting the rest down", () => {
    expect(insertStepAt(["a", "b", "c"], "new", 1)).toEqual(["a", "new", "b", "c"]);
  });

  it("moves a step already in the list rather than duplicating it", () => {
    expect(insertStepAt(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });

  it("clamps a position past either end", () => {
    expect(insertStepAt(["a", "b"], "new", 99)).toEqual(["a", "b", "new"]);
    expect(insertStepAt(["a", "b"], "new", -5)).toEqual(["new", "a", "b"]);
  });
});

describe("arrangeByFlow", () => {
  it("puts a step added last back where its connection says it belongs", () => {
    // The case this exists for: "invoicing" was forgotten, added afterwards, and
    // so sits at the bottom even though payment runs after it.
    const order = ["start", "validate", "payment", "invoicing"];
    const connections = [
      { fromStepId: "start", toStepId: "validate" },
      { fromStepId: "validate", toStepId: "invoicing" },
      { fromStepId: "invoicing", toStepId: "payment" },
    ];

    expect(arrangeByFlow(order, connections)).toEqual(["start", "validate", "invoicing", "payment"]);
  });

  it("leaves an already-correct order untouched", () => {
    const order = ["a", "b", "c"];
    const connections = [
      { fromStepId: "a", toStepId: "b" },
      { fromStepId: "b", toStepId: "c" },
    ];
    expect(arrangeByFlow(order, connections)).toEqual(order);
  });

  it("keeps unconnected steps in the order they were already in", () => {
    expect(arrangeByFlow(["c", "a", "b"], [])).toEqual(["c", "a", "b"]);
  });

  it("takes a decision's branches in their existing order", () => {
    const order = ["start", "decide", "yes", "no"];
    const connections = [
      { fromStepId: "start", toStepId: "decide" },
      { fromStepId: "decide", toStepId: "yes" },
      { fromStepId: "decide", toStepId: "no" },
    ];
    expect(arrangeByFlow(order, connections)).toEqual(["start", "decide", "yes", "no"]);
  });

  it("pulls a stranded step up beside its predecessor even when the map branches", () => {
    // The real shape this has to handle: an approval that loops back, so a
    // plain topological sort is free to leave the late-added step at the
    // bottom. Ordering by depth puts it beside the other successor of the step
    // it connects from.
    const order = ["start", "create", "approve", "revise", "send", "forgotten"];
    const connections = [
      { fromStepId: "start", toStepId: "create" },
      { fromStepId: "create", toStepId: "approve" },
      { fromStepId: "create", toStepId: "forgotten" },
      { fromStepId: "approve", toStepId: "revise" },
      { fromStepId: "approve", toStepId: "send" },
      { fromStepId: "revise", toStepId: "create" },
    ];

    expect(arrangeByFlow(order, connections)).toEqual([
      "start",
      "create",
      "approve",
      "forgotten",
      "revise",
      "send",
    ]);
  });

  it("groups steps the same distance into the flow together", () => {
    // Two parallel branches off one step stay side by side rather than one
    // chain being emitted entirely before the other starts.
    const order = ["start", "a1", "a2", "b1", "b2"];
    const connections = [
      { fromStepId: "start", toStepId: "a1" },
      { fromStepId: "a1", toStepId: "a2" },
      { fromStepId: "start", toStepId: "b1" },
      { fromStepId: "b1", toStepId: "b2" },
    ];
    expect(arrangeByFlow(order, connections)).toEqual(["start", "a1", "b1", "a2", "b2"]);
  });

  it("still emits every step exactly once when the map loops back on itself", () => {
    // A rejected approval routing back to a revise step is a real map, and it
    // has no valid topological order — the result must still be complete.
    const order = ["start", "approve", "revise", "pay"];
    const connections = [
      { fromStepId: "start", toStepId: "approve" },
      { fromStepId: "approve", toStepId: "revise" },
      { fromStepId: "revise", toStepId: "approve" },
      { fromStepId: "approve", toStepId: "pay" },
    ];

    const arranged = arrangeByFlow(order, connections);
    expect([...arranged].sort()).toEqual([...order].sort());
    expect(arranged[0]).toBe("start");
  });

  it("ignores connections pointing at steps outside this process, and self-loops", () => {
    const order = ["a", "b"];
    const connections = [
      { fromStepId: "elsewhere", toStepId: "b" },
      { fromStepId: "a", toStepId: "gone" },
      { fromStepId: "a", toStepId: "a" },
    ];
    expect(arrangeByFlow(order, connections)).toEqual(["a", "b"]);
  });

  it("handles an empty process", () => {
    expect(arrangeByFlow([], [])).toEqual([]);
  });
});
