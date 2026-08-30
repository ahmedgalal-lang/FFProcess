import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  DARK_INK,
  hexToRgb,
  LIGHT_INK,
  mixHex,
  readableInkOn,
  relativeLuminance,
  rgbToHex,
} from "@/lib/domain/color-contrast";

describe("hexToRgb / rgbToHex", () => {
  it("parses a hex colour with or without the hash", () => {
    expect(hexToRgb("#1b2a56")).toEqual({ r: 27, g: 42, b: 86 });
    expect(hexToRgb("1b2a56")).toEqual({ r: 27, g: 42, b: 86 });
  });

  it("returns null for anything that isn't a 6-digit hex", () => {
    expect(hexToRgb("blue")).toBeNull();
    expect(hexToRgb("#abc")).toBeNull();
    expect(hexToRgb("")).toBeNull();
  });

  it("round-trips back to the same hex", () => {
    expect(rgbToHex({ r: 27, g: 42, b: 86 })).toBe("#1b2a56");
  });

  it("clamps out-of-range channels rather than emitting invalid hex", () => {
    expect(rgbToHex({ r: -20, g: 300, b: 128 })).toBe("#00ff80");
  });
});

describe("relativeLuminance", () => {
  it("puts black at 0 and white at 1", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("ranks a pale colour above a dark one", () => {
    expect(relativeLuminance("#fde047")).toBeGreaterThan(relativeLuminance("#1b2a56"));
  });
});

describe("contrastRatio", () => {
  it("gives the known 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });

  it("gives 1 for a colour against itself", () => {
    expect(contrastRatio("#4e9e72", "#4e9e72")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#1b2a56", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#1b2a56"), 5);
  });
});

describe("readableInkOn", () => {
  it("uses white on a dark brand colour", () => {
    expect(readableInkOn("#1b2a56")).toBe(LIGHT_INK); // RHI navy
    expect(readableInkOn("#7c1d3f")).toBe(LIGHT_INK); // maroon
    expect(readableInkOn("#000000")).toBe(LIGHT_INK);
  });

  it("uses dark ink on a pale brand colour, rather than unreadable white", () => {
    expect(readableInkOn("#fde047")).toBe(DARK_INK); // yellow
    expect(readableInkOn("#a7f3d0")).toBe(DARK_INK); // pale green
    expect(readableInkOn("#ffffff")).toBe(DARK_INK);
  });

  it("always picks the option with the higher contrast ratio", () => {
    for (const bg of ["#1b2a56", "#fde047", "#4e9e72", "#808080", "#ca8a04", "#0f766e"]) {
      const ink = readableInkOn(bg);
      const other = ink === LIGHT_INK ? DARK_INK : LIGHT_INK;
      expect(contrastRatio(bg, ink)).toBeGreaterThanOrEqual(contrastRatio(bg, other));
    }
  });

  it("clears WCAG AA large-text contrast (3:1) on every palette we sampled", () => {
    for (const bg of ["#1b2a56", "#fde047", "#4e9e72", "#b45309", "#7c1d3f", "#a7f3d0", "#2f4d8f"]) {
      expect(contrastRatio(bg, readableInkOn(bg))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("mixHex", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("blends halfway", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps t outside 0..1", () => {
    expect(mixHex("#000000", "#ffffff", -3)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 9)).toBe("#ffffff");
  });

  it("falls back to the first colour when either input is invalid", () => {
    expect(mixHex("#1b2a56", "nope", 0.5)).toBe("#1b2a56");
  });
});
