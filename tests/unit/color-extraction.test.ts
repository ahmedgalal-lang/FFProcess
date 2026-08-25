import { describe, it, expect } from "vitest";
import { pickDistinctColors, type ColorBucket } from "@/lib/domain/color-extraction";

describe("pickDistinctColors", () => {
  it("returns the most frequent bucket first", () => {
    const buckets: ColorBucket[] = [
      { r: 200, g: 0, b: 0, count: 5 },
      { r: 0, g: 200, b: 0, count: 50 },
      { r: 0, g: 0, b: 200, count: 20 },
    ];
    expect(pickDistinctColors(buckets, 1)).toEqual(["#00c800"]);
  });

  it("returns up to max colors, ordered by frequency", () => {
    const buckets: ColorBucket[] = [
      { r: 200, g: 0, b: 0, count: 5 },
      { r: 0, g: 200, b: 0, count: 50 },
      { r: 0, g: 0, b: 200, count: 20 },
    ];
    expect(pickDistinctColors(buckets, 3)).toEqual(["#00c800", "#0000c8", "#c80000"]);
  });

  it("skips buckets too close in color to one already picked", () => {
    const buckets: ColorBucket[] = [
      { r: 100, g: 100, b: 100, count: 50 },
      { r: 105, g: 100, b: 100, count: 40 }, // near-duplicate of the top pick
      { r: 0, g: 0, b: 200, count: 10 }, // genuinely distinct
    ];
    expect(pickDistinctColors(buckets, 2)).toEqual(["#646464", "#0000c8"]);
  });

  it("returns fewer than max when there aren't enough distinct buckets", () => {
    const buckets: ColorBucket[] = [{ r: 10, g: 20, b: 30, count: 5 }];
    expect(pickDistinctColors(buckets, 3)).toEqual(["#0a141e"]);
  });

  it("returns an empty array for no buckets", () => {
    expect(pickDistinctColors([], 3)).toEqual([]);
  });

  it("respects a custom minDistance threshold", () => {
    const buckets: ColorBucket[] = [
      { r: 100, g: 100, b: 100, count: 50 },
      { r: 130, g: 100, b: 100, count: 40 },
    ];
    // distance here is 30 — passes with a lower threshold, rejected by the default
    expect(pickDistinctColors(buckets, 2, 10)).toEqual(["#646464", "#826464"]);
    expect(pickDistinctColors(buckets, 2, 60)).toEqual(["#646464"]);
  });
});
