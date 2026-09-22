import { describe, it, expect } from "vitest";
import { deriveRiskLevel } from "@/lib/domain/governance-risk";

describe("deriveRiskLevel", () => {
  it("matches every worked example from the approved mockup", () => {
    // Pinned against https://claude.ai/artifact/WwGMgev9B2EF5zHhoViFjC so the
    // real implementation reads exactly like what was reviewed and approved.
    expect(deriveRiskLevel("MEDIUM", "HIGH")).toBe("HIGH"); // single processor dependency
    expect(deriveRiskLevel("HIGH", "MEDIUM")).toBe("HIGH"); // no segregation of duties
    expect(deriveRiskLevel("LOW", "CRITICAL")).toBe("MEDIUM"); // client fund commingling
    expect(deriveRiskLevel("MEDIUM", "LOW")).toBe("LOW"); // key-person dependency
  });

  it("a low-likelihood, critical-impact risk is never banded as merely low", () => {
    // The specific case the banding exists to get right: rare but
    // catastrophic must not read the same as rare and minor.
    expect(deriveRiskLevel("LOW", "CRITICAL")).not.toBe("LOW");
  });

  it("the extremes are HIGH and LOW", () => {
    expect(deriveRiskLevel("HIGH", "CRITICAL")).toBe("HIGH");
    expect(deriveRiskLevel("LOW", "LOW")).toBe("LOW");
  });
});
