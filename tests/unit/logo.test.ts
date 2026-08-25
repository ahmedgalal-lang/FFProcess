import { describe, it, expect } from "vitest";
import { validateLogoDataUrl, isValidHexColor } from "@/lib/domain/logo";

describe("validateLogoDataUrl", () => {
  it("accepts a small PNG data URL", () => {
    expect(validateLogoDataUrl("data:image/png;base64,aGVsbG8=")).toEqual({ ok: true });
  });

  it("accepts PNG, JPEG, WebP, and SVG mime types", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      expect(validateLogoDataUrl(`data:${mime};base64,aGVsbG8=`)).toEqual({ ok: true });
    }
  });

  it("rejects a non-data-URL string", () => {
    const result = validateLogoDataUrl("not-a-data-url");
    expect(result.ok).toBe(false);
  });

  it("rejects a disallowed image mime type", () => {
    const result = validateLogoDataUrl("data:image/gif;base64,aGVsbG8=");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("PNG, JPEG, WebP, or SVG");
  });

  it("rejects a non-image data URL", () => {
    const result = validateLogoDataUrl("data:application/pdf;base64,aGVsbG8=");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("uploaded image file");
  });

  it("rejects a data URL over the size cap", () => {
    const huge = "data:image/png;base64," + "A".repeat(500_000);
    const result = validateLogoDataUrl(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("too large");
  });
});

describe("isValidHexColor", () => {
  it("accepts a 6-digit hex color", () => {
    expect(isValidHexColor("#2563eb")).toBe(true);
    expect(isValidHexColor("#FFFFFF")).toBe(true);
  });

  it("rejects a 3-digit shorthand hex color", () => {
    expect(isValidHexColor("#fff")).toBe(false);
  });

  it("rejects a value with no leading #", () => {
    expect(isValidHexColor("2563eb")).toBe(false);
  });

  it("rejects a non-hex string", () => {
    expect(isValidHexColor("#zzzzzz")).toBe(false);
  });
});
