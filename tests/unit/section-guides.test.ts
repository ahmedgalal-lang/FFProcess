import { describe, expect, it } from "vitest";
import { SECTION_GUIDES } from "@/lib/domain/section-guides";

describe("SECTION_GUIDES", () => {
  it("covers every section of the Governance page", () => {
    expect(Object.keys(SECTION_GUIDES)).toEqual([
      "attention",
      "profile",
      "assessment",
      "governing",
      "checklist",
      "risk",
      "policy",
      "activity",
      "controls",
    ]);
  });

  it("gives every guide a description, reasons, steps, and good and warning signs", () => {
    for (const guide of Object.values(SECTION_GUIDES)) {
      expect(guide.title.length).toBeGreaterThan(0);
      expect(guide.what.length).toBeGreaterThan(0);
      expect(guide.why.length).toBeGreaterThan(0);
      expect(guide.how.length).toBeGreaterThan(1);
      expect(guide.good.length).toBeGreaterThan(0);
      expect(guide.bad.length).toBeGreaterThan(0);
      for (const text of [...guide.why, ...guide.how, ...guide.good, ...guide.bad]) {
        expect(text).not.toMatch(/<[a-z]/i); // plain text, no markup
      }
    }
  });
});
