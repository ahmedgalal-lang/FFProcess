import { describe, it, expect } from "vitest";
import { applyPackOrder } from "@/lib/domain/process-order";

/**
 * The order a report comes out in is the order its link names its processes.
 * Before this, load-report-data.ts threw that sequence away twice over — a SQL
 * `IN` doesn't preserve argument order, and the `orderBy: { code: "asc" }` on
 * top of it overrode whatever order did survive — so a pack could only ever
 * come out in code order.
 *
 * These are the rules for re-applying it. The sequence is a *sort*, never a
 * filter: a report link is out in the world, it can name a process that has
 * since been deleted or omit one that exists, and it still has to render.
 */
describe("applyPackOrder", () => {
  const items = [
    { id: "exe", label: "Execution" },
    { id: "geo", label: "Geo Mining" },
    { id: "new", label: "New Opportunity" },
  ];

  it("puts the items into the order the ids name", () => {
    expect(applyPackOrder(items, ["new", "geo", "exe"]).map((i) => i.id)).toEqual([
      "new",
      "geo",
      "exe",
    ]);
  });

  it("leaves the order untouched when the sequence is empty", () => {
    // The whole-workspace case: nothing arranged, so nothing to re-order.
    expect(applyPackOrder(items, []).map((i) => i.id)).toEqual(["exe", "geo", "new"]);
  });

  it("keeps unnamed items in their existing relative order, after the named ones", () => {
    // A hand-edited or truncated link names only some of the pack. The rest
    // must still appear, deterministically, rather than vanishing.
    expect(applyPackOrder(items, ["new"]).map((i) => i.id)).toEqual(["new", "exe", "geo"]);
  });

  it("ignores an id naming nothing in the list", () => {
    // A process deleted since the link was made, or an id for another
    // workspace that the query already filtered out.
    expect(applyPackOrder(items, ["new", "deleted", "exe"]).map((i) => i.id)).toEqual([
      "new",
      "exe",
      "geo",
    ]);
  });

  it("ignores a repeated id rather than duplicating the item", () => {
    expect(applyPackOrder(items, ["new", "new", "exe"]).map((i) => i.id)).toEqual([
      "new",
      "exe",
      "geo",
    ]);
  });

  it("returns an empty list unchanged", () => {
    expect(applyPackOrder([], ["new"])).toEqual([]);
  });

  it("does not mutate the list it was given", () => {
    const original = [...items];
    applyPackOrder(items, ["new", "geo", "exe"]);
    expect(items).toEqual(original);
  });
});
