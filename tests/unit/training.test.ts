import { describe, expect, it } from "vitest";
import { EXPIRING_SOON_DAYS, trainingExpiry, trainingState } from "@/lib/domain/training";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = d("2026-09-28");

describe("trainingExpiry", () => {
  it("adds the validity period in calendar months", () => {
    expect(trainingExpiry(d("2025-09-28"), 12)?.toISOString().slice(0, 10)).toBe("2026-09-28");
    expect(trainingExpiry(d("2026-03-15"), 6)?.toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(trainingExpiry(d("2026-01-31"), 1)?.toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(trainingExpiry(d("2023-02-28"), 12)?.toISOString().slice(0, 10)).toBe("2024-02-28");
  });

  it("never expires without a validity period", () => {
    expect(trainingExpiry(d("2020-01-01"), null)).toBeNull();
  });
});

describe("trainingState", () => {
  it("is Current well before expiry", () => {
    expect(trainingState(today, 12, today)).toBe("CURRENT");
  });

  it("is Expiring soon within 30 days of expiry, including the expiry day itself", () => {
    expect(EXPIRING_SOON_DAYS).toBe(30);
    expect(trainingState(d("2025-10-28"), 12, today)).toBe("EXPIRING_SOON"); // expires in 30 days
    expect(trainingState(d("2025-09-28"), 12, today)).toBe("EXPIRING_SOON"); // expires today
    expect(trainingState(d("2025-10-29"), 12, today)).toBe("CURRENT"); // 31 days out
  });

  it("is Expired once the expiry date has passed", () => {
    expect(trainingState(d("2025-09-27"), 12, today)).toBe("EXPIRED");
    expect(trainingState(d("2025-08-28"), 12, today)).toBe("EXPIRED");
  });

  it("has no expiry without a validity period", () => {
    expect(trainingState(d("2010-01-01"), null, today)).toBe("NO_EXPIRY");
  });
});
