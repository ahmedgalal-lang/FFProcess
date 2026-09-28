import { describe, expect, it } from "vitest";
import { isChecklistItemOverdue } from "@/lib/domain/checklist-due";

describe("isChecklistItemOverdue", () => {
  const today = new Date("2026-09-28T12:00:00Z");
  const yesterday = new Date("2026-09-27");
  const tomorrow = new Date("2026-09-29");

  it.each(["OPEN", "EDITED"] as const)("is overdue when %s and past its due date", (status) => {
    expect(isChecklistItemOverdue(status, yesterday, today)).toBe(true);
  });

  it.each(["DONE", "DISMISSED"] as const)("is never overdue once %s", (status) => {
    expect(isChecklistItemOverdue(status, yesterday, today)).toBe(false);
  });

  it("is not overdue before its due date, or on the day itself", () => {
    expect(isChecklistItemOverdue("OPEN", tomorrow, today)).toBe(false);
    expect(isChecklistItemOverdue("OPEN", new Date("2026-09-28"), today)).toBe(false);
  });

  it("is not overdue with no due date", () => {
    expect(isChecklistItemOverdue("OPEN", null, today)).toBe(false);
  });
});
