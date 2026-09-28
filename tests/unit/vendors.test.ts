import { describe, expect, it } from "vitest";
import { RENEWAL_WINDOW_DAYS, contractState, isDueDiligenceOverdue, nextDueDiligenceOn, sortVendors } from "@/lib/domain/vendors";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = d("2026-09-28");

describe("due diligence", () => {
  it("is next due one review cycle after the last one", () => {
    expect(nextDueDiligenceOn(d("2025-09-28"), 12)?.toISOString().slice(0, 10)).toBe("2026-09-28");
  });

  it("has no next date without both a last review and a cycle", () => {
    expect(nextDueDiligenceOn(null, 12)).toBeNull();
    expect(nextDueDiligenceOn(d("2025-09-28"), null)).toBeNull();
  });

  it("is overdue only once the next review date has passed", () => {
    expect(isDueDiligenceOverdue(d("2025-08-28"), 12, today)).toBe(true);
    expect(isDueDiligenceOverdue(d("2025-09-28"), 12, today)).toBe(false); // due today
    expect(isDueDiligenceOverdue(null, 12, today)).toBe(false);
    expect(isDueDiligenceOverdue(d("2020-01-01"), null, today)).toBe(false);
  });
});

describe("contractState", () => {
  it("reads the contract end date against a 60-day renewal window", () => {
    expect(RENEWAL_WINDOW_DAYS).toBe(60);
    expect(contractState(null, today)).toBe("NONE");
    expect(contractState(d("2026-09-27"), today)).toBe("EXPIRED");
    expect(contractState(d("2026-09-28"), today)).toBe("RENEWAL_SOON"); // ends today
    expect(contractState(d("2026-11-27"), today)).toBe("RENEWAL_SOON"); // 60 days out
    expect(contractState(d("2026-11-28"), today)).toBe("ACTIVE");
  });
});

describe("sortVendors", () => {
  it("lists the most critical first, then by name, without mutating the input", () => {
    const input = [
      { name: "Zeta", criticality: "LOW" as const },
      { name: "beta", criticality: "CRITICAL" as const },
      { name: "Alpha", criticality: "CRITICAL" as const },
      { name: "Gamma", criticality: "MEDIUM" as const },
      { name: "Delta", criticality: "HIGH" as const },
    ];
    expect(sortVendors(input).map((v) => v.name)).toEqual(["Alpha", "beta", "Delta", "Gamma", "Zeta"]);
    expect(input[0]!.name).toBe("Zeta");
  });
});
