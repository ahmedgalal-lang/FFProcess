import { describe, expect, it } from "vitest";
import { formatCaseReference } from "@/lib/domain/ethics";

describe("formatCaseReference", () => {
  it("pads the case number to four digits", () => {
    expect(formatCaseReference(1)).toBe("CASE-0001");
    expect(formatCaseReference(7)).toBe("CASE-0007");
    expect(formatCaseReference(1234)).toBe("CASE-1234");
  });

  it("grows past four digits rather than wrapping", () => {
    expect(formatCaseReference(12345)).toBe("CASE-12345");
  });
});
