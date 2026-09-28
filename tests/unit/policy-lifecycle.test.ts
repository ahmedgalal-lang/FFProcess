import { describe, it, expect } from "vitest";
import { isPolicyOverdueForReview } from "@/lib/domain/policy-lifecycle";

describe("isPolicyOverdueForReview", () => {
  const yesterday = new Date("2026-09-27");
  const tomorrow = new Date("2026-09-29");
  const today = new Date("2026-09-28");

  it("is overdue for a Published policy with a past review-due date", () => {
    expect(isPolicyOverdueForReview("PUBLISHED", yesterday, today)).toBe(true);
  });

  it("is not overdue for a Published policy with a future review-due date", () => {
    expect(isPolicyOverdueForReview("PUBLISHED", tomorrow, today)).toBe(false);
  });

  it("is not overdue for a Published policy with no review-due date set", () => {
    expect(isPolicyOverdueForReview("PUBLISHED", null, today)).toBe(false);
  });

  it.each(["DRAFT", "IN_REVIEW", "APPROVED", "RETIRED"] as const)(
    "is never overdue for a %s policy, even with a past review-due date",
    (status) => {
      expect(isPolicyOverdueForReview(status, yesterday, today)).toBe(false);
    }
  );
});
