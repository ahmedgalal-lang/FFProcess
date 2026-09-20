import { describe, it, expect } from "vitest";
import {
  paginate,
  PRINT_PAGE_HEIGHT_PX,
  type AtomicBlock,
} from "@/lib/domain/report-pagination";

const PAGE = PRINT_PAGE_HEIGHT_PX;

/** n blocks of the given height, named so a failure says which one. */
function blocks(...heights: number[]): AtomicBlock[] {
  return heights.map((height, i) => ({ id: `b${i + 1}`, height }));
}

describe("packing blocks onto pages", () => {
  it("fills a page before starting another", () => {
    // Three blocks that together fit one page.
    const result = paginate(blocks(PAGE / 4, PAGE / 4, PAGE / 4));
    expect(result.breaks).toEqual([]);
    expect(result.pageCount).toBe(1);
  });

  it("moves a block that does not fit onto the next page, whole", () => {
    const result = paginate(blocks(PAGE * 0.7, PAGE * 0.5));
    expect(result.pageCount).toBe(2);
    expect(result.breaks).toHaveLength(1);
    // The break falls *before* the block that did not fit, never inside it.
    expect(result.breaks[0]!.beforeBlockId).toBe("b2");
    expect(result.breaks[0]!.offset).toBe(PAGE * 0.7);
  });

  it("packs several blocks a page rather than one each", () => {
    // Eight eighth-of-a-page blocks belong on one page, not eight.
    const result = paginate(blocks(...Array.from({ length: 8 }, () => PAGE / 8)));
    expect(result.pageCount).toBe(1);
  });

  it("starts a page for a block that asks for one, even with room left", () => {
    const result = paginate(blocks(PAGE * 0.2, PAGE * 0.2, PAGE * 0.2), {
      forcedBreakBefore: ["b2"],
    });
    expect(result.pageCount).toBe(2);
    expect(result.breaks[0]!.beforeBlockId).toBe("b2");
    // b3 still shares b2's page — a forced break is not contagious.
    expect(result.breaks).toHaveLength(1);
  });

  it("does not force a break before the very first block", () => {
    const result = paginate(blocks(PAGE * 0.3), { forcedBreakBefore: ["b1"] });
    expect(result.breaks).toEqual([]);
    expect(result.pageCount).toBe(1);
  });

  it("reports how much of each page carries content", () => {
    const result = paginate(blocks(PAGE * 0.7, PAGE * 0.5));
    expect(result.usage).toHaveLength(2);
    expect(result.usage[0]).toBeCloseTo(0.7, 5);
    expect(result.usage[1]).toBeCloseTo(0.5, 5);
  });

  it("is deterministic — the same heights always give the same breaks", () => {
    const heights = [120, 400, 300, 90, 640, 210];
    expect(paginate(blocks(...heights))).toEqual(paginate(blocks(...heights)));
  });
});

describe("a block taller than a page", () => {
  it("is named rather than silently tolerated", () => {
    const result = paginate(blocks(PAGE * 2.2));
    // 2.2 pages is exactly what the report's diagram was allowed to be, and
    // nothing said so for a long time.
    expect(result.oversized).toEqual(["b1"]);
  });

  it("leaves a normal document reporting none", () => {
    expect(paginate(blocks(100, 200, 300)).oversized).toEqual([]);
  });

  it("still accounts for the pages it spans", () => {
    const result = paginate(blocks(PAGE * 2.5));
    expect(result.pageCount).toBeGreaterThanOrEqual(3);
  });

  it("starts on a fresh page when something precedes it", () => {
    const result = paginate(blocks(PAGE * 0.3, PAGE * 1.5));
    expect(result.breaks[0]!.beforeBlockId).toBe("b2");
  });
});

describe("never throws, never loops", () => {
  // The wrapped process map hit this exact hazard: a zero divisor produced an
  // infinite layout, so a mutation hung the test runner instead of failing it.
  // On a report page that would be a hung request.
  it("survives heights no measurement should ever produce", () => {
    for (const height of [0, -1, -9999, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = paginate(blocks(height, 200, height));
      expect(Number.isFinite(result.pageCount), `height ${height}`).toBe(true);
      expect(result.pageCount).toBeGreaterThanOrEqual(1);
      expect(result.pageCount).toBeLessThan(1000);
      expect(result.usage.every((u) => Number.isFinite(u))).toBe(true);
    }
  });

  it("handles a document of no blocks", () => {
    const result = paginate([]);
    expect(result.breaks).toEqual([]);
    expect(result.pageCount).toBe(1);
    expect(result.oversized).toEqual([]);
  });

  it("handles a document of one block", () => {
    expect(paginate(blocks(PAGE * 0.4)).pageCount).toBe(1);
  });

  it("ignores a forced break naming a block that is not there", () => {
    const result = paginate(blocks(PAGE * 0.3, PAGE * 0.3), { forcedBreakBefore: ["ghost"] });
    expect(result.pageCount).toBe(1);
  });

  it("keeps usage between 0 and 1 whatever it is given", () => {
    const result = paginate(blocks(PAGE * 3, 0, PAGE * 0.5, Number.NaN));
    for (const u of result.usage) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
  });
});

describe("the rule holds for any report (SC-008)", () => {
  it("never breaks inside a block, whatever the heights", () => {
    // Randomised, because a report's sections are chosen per client and this
    // has to hold for orders nobody thought to try.
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

    for (let run = 0; run < 200; run++) {
      const heights = Array.from({ length: 1 + Math.floor(rand() * 20) }, () =>
        Math.floor(rand() * PAGE * 0.9) + 1
      );
      const result = paginate(blocks(...heights));

      // Every break must sit exactly on a block boundary.
      const boundaries = new Set<number>();
      let running = 0;
      for (const h of heights) {
        boundaries.add(running);
        running += h;
      }
      boundaries.add(running);
      for (const b of result.breaks) {
        expect(boundaries.has(b.offset), `run ${run}: break at ${b.offset}`).toBe(true);
      }
      // ...and no page may hold more than a page's worth.
      for (const u of result.usage) expect(u).toBeLessThanOrEqual(1.0001);
    }
  });
});
