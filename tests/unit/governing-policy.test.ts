import { describe, expect, it } from "vitest";
import { aspectPolicyState } from "@/lib/domain/governing-policy";

describe("aspectPolicyState", () => {
  it("is NONE without a governing policy", () => {
    expect(aspectPolicyState(null)).toBe("NONE");
  });

  it("is PUBLISHED only for a Published policy; Retired and everything before publishing count as not published", () => {
    expect(aspectPolicyState({ lifecycleStatus: "PUBLISHED" })).toBe("PUBLISHED");
    for (const status of ["DRAFT", "IN_REVIEW", "APPROVED", "RETIRED"] as const) {
      expect(aspectPolicyState({ lifecycleStatus: status })).toBe("NOT_PUBLISHED");
    }
  });
});
