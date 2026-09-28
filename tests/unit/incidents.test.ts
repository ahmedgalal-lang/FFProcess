import { describe, expect, it } from "vitest";
import {
  BREACH_NOTIFICATION_HOURS,
  breachDeadline,
  breachNotificationState,
  daysOpen,
  describeBreachState,
  isIncidentActionOverdue,
  sortIncidents,
} from "@/lib/domain/incidents";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-09-28T12:00:00Z");

describe("daysOpen", () => {
  it("counts calendar days from the day it occurred to today while it's open", () => {
    expect(daysOpen(new Date("2026-09-25T23:00:00Z"), null, now)).toBe(3);
    expect(daysOpen(new Date("2026-09-28T01:00:00Z"), null, now)).toBe(0);
  });

  it("stops counting on the day it was closed", () => {
    expect(daysOpen(new Date("2026-09-01T00:00:00Z"), new Date("2026-09-11T08:00:00Z"), now)).toBe(10);
  });
});

describe("sortIncidents", () => {
  const inc = (id: string, status: string, severity: string, occurredAt = "2026-09-01") => ({
    id,
    status: status as "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED",
    severity: severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    occurredAt: new Date(occurredAt),
  });

  it("lists every not-yet-closed incident before closed ones, most severe first", () => {
    const sorted = sortIncidents([
      inc("closed-critical", "CLOSED", "CRITICAL"),
      inc("open-low", "OPEN", "LOW"),
      inc("resolved-high", "RESOLVED", "HIGH"),
      inc("investigating-critical", "INVESTIGATING", "CRITICAL"),
      inc("closed-low", "CLOSED", "LOW"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual([
      "investigating-critical",
      "resolved-high",
      "open-low",
      "closed-critical",
      "closed-low",
    ]);
  });

  it("breaks a severity tie with the most recent first, and doesn't mutate its input", () => {
    const input = [inc("older", "OPEN", "HIGH", "2026-08-01"), inc("newer", "OPEN", "HIGH", "2026-09-01")];
    expect(sortIncidents(input).map((i) => i.id)).toEqual(["newer", "older"]);
    expect(input.map((i) => i.id)).toEqual(["older", "newer"]);
  });
});

describe("isIncidentActionOverdue", () => {
  it("is overdue only when open and due before today", () => {
    expect(isIncidentActionOverdue(new Date("2026-09-27"), null, now)).toBe(true);
    expect(isIncidentActionOverdue(new Date("2026-09-28"), null, now)).toBe(false);
    expect(isIncidentActionOverdue(new Date("2026-09-27"), new Date("2026-09-28"), now)).toBe(false);
    expect(isIncidentActionOverdue(null, null, now)).toBe(false);
  });
});

describe("breach notification clock", () => {
  const base = {
    personalDataBreach: true,
    breachAwareAt: null as Date | null,
    regulatorNotifiedAt: null as Date | null,
    notificationNotRequiredReason: null as string | null,
  };

  it("is 72 hours after awareness (GDPR Article 33)", () => {
    expect(BREACH_NOTIFICATION_HOURS).toBe(72);
    expect(breachDeadline(new Date("2026-09-28T00:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("doesn't apply to an incident that isn't a personal data breach", () => {
    expect(breachNotificationState({ ...base, personalDataBreach: false }, now)).toEqual({ state: "N/A", hoursRemaining: null, deadline: null });
  });

  it("counts down the hours left, rounding a part-hour up", () => {
    const awareAt = new Date(now.getTime() - 60 * HOUR);
    expect(breachNotificationState({ ...base, breachAwareAt: awareAt }, now)).toMatchObject({ state: "PENDING", hoursRemaining: 12 });
    const aMomentLater = new Date(now.getTime() + 5000);
    expect(breachNotificationState({ ...base, breachAwareAt: awareAt }, aMomentLater)).toMatchObject({ hoursRemaining: 12 });
  });

  it("is pending with no clock until the awareness time is recorded", () => {
    expect(breachNotificationState(base, now)).toEqual({ state: "PENDING", hoursRemaining: null, deadline: null });
  });

  it("is overdue once the deadline passes with no decision recorded", () => {
    const awareAt = new Date(now.getTime() - 72 * HOUR);
    expect(breachNotificationState({ ...base, breachAwareAt: awareAt }, now)).toMatchObject({ state: "OVERDUE", hoursRemaining: 0 });
  });

  it("stops the clock once the regulator is notified or notification isn't required", () => {
    const awareAt = new Date(now.getTime() - 100 * HOUR);
    expect(
      breachNotificationState({ ...base, breachAwareAt: awareAt, regulatorNotifiedAt: new Date(now.getTime() - 50 * HOUR) }, now).state
    ).toBe("NOTIFIED");
    expect(breachNotificationState({ ...base, breachAwareAt: awareAt, notificationNotRequiredReason: "Low risk" }, now).state).toBe(
      "NOT_REQUIRED"
    );
  });
});

describe("describeBreachState", () => {
  it("words each state, marking the ones that still need action as urgent", () => {
    expect(describeBreachState({ state: "N/A", hoursRemaining: null })).toBeNull();
    expect(describeBreachState({ state: "PENDING", hoursRemaining: 12 })).toEqual({ text: "12 hours left to notify the regulator", urgent: true });
    expect(describeBreachState({ state: "PENDING", hoursRemaining: 1 })?.text).toBe("1 hour left to notify the regulator");
    expect(describeBreachState({ state: "PENDING", hoursRemaining: null })?.urgent).toBe(true);
    expect(describeBreachState({ state: "OVERDUE", hoursRemaining: 0 })).toEqual({ text: "Notification overdue", urgent: true });
    expect(describeBreachState({ state: "NOTIFIED", hoursRemaining: null })?.urgent).toBe(false);
    expect(describeBreachState({ state: "NOT_REQUIRED", hoursRemaining: null })?.urgent).toBe(false);
  });
});
