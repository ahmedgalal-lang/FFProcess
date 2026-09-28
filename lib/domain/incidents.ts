/**
 * The incident log's rules (spec 024) — pure, so they're unit-tested without
 * a database. Computed on the server and passed to the page as values.
 */

import { dayOf } from "@/lib/domain/checklist-due";

export type IncidentSeverityT = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatusT = "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";

/** GDPR Article 33: notify the regulator within 72 hours of becoming aware. */
export const BREACH_NOTIFICATION_HOURS = 72;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const SEVERITY_RANK: Record<IncidentSeverityT, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Calendar days from the day it occurred to the day it closed, or to today while open. */
export function daysOpen(occurredAt: Date, closedAt: Date | null, today: Date): number {
  const from = Date.parse(dayOf(occurredAt));
  const to = Date.parse(dayOf(closedAt ?? today));
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

/**
 * Not-yet-closed incidents first (Resolved is still awaiting closure), then
 * most severe first, then most recent first. Returns a new array.
 */
export function sortIncidents<T extends { status: IncidentStatusT; severity: IncidentSeverityT; occurredAt: Date }>(
  incidents: readonly T[]
): T[] {
  return [...incidents].sort(
    (a, b) =>
      Number(a.status === "CLOSED") - Number(b.status === "CLOSED") ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.occurredAt.getTime() - a.occurredAt.getTime()
  );
}

/** Overdue by calendar day, like checklist items: due today isn't late yet. */
export function isIncidentActionOverdue(dueDate: Date | null, doneAt: Date | null, today: Date): boolean {
  if (!dueDate || doneAt) return false;
  return dayOf(dueDate) < dayOf(today);
}

export function breachDeadline(awareAt: Date): Date {
  return new Date(awareAt.getTime() + BREACH_NOTIFICATION_HOURS * HOUR_MS);
}

export type BreachNotificationState = {
  state: "N/A" | "PENDING" | "OVERDUE" | "NOTIFIED" | "NOT_REQUIRED";
  /** Whole hours left, a part-hour rounded up; 0 once overdue; null without a running clock. */
  hoursRemaining: number | null;
  deadline: Date | null;
};

/**
 * Where a personal data breach stands on the regulator-notification clock.
 * Either decision — notified, or not required — stops the clock.
 */
export function breachNotificationState(
  incident: {
    personalDataBreach: boolean;
    breachAwareAt: Date | null;
    regulatorNotifiedAt: Date | null;
    notificationNotRequiredReason: string | null;
  },
  now: Date
): BreachNotificationState {
  if (!incident.personalDataBreach) return { state: "N/A", hoursRemaining: null, deadline: null };
  const deadline = incident.breachAwareAt ? breachDeadline(incident.breachAwareAt) : null;
  if (incident.regulatorNotifiedAt) return { state: "NOTIFIED", hoursRemaining: null, deadline };
  if (incident.notificationNotRequiredReason) return { state: "NOT_REQUIRED", hoursRemaining: null, deadline };
  if (!deadline) return { state: "PENDING", hoursRemaining: null, deadline: null };
  const left = deadline.getTime() - now.getTime();
  if (left <= 0) return { state: "OVERDUE", hoursRemaining: 0, deadline };
  return { state: "PENDING", hoursRemaining: Math.ceil(left / HOUR_MS), deadline };
}

/** The breach clock in words, shared by the incident log and the privacy register. Null when it doesn't apply. */
export function describeBreachState(breach: Pick<BreachNotificationState, "state" | "hoursRemaining">): { text: string; urgent: boolean } | null {
  const { state, hoursRemaining } = breach;
  if (state === "N/A") return null;
  if (state === "OVERDUE") return { text: "Notification overdue", urgent: true };
  if (state === "NOTIFIED") return { text: "Regulator notified", urgent: false };
  if (state === "NOT_REQUIRED") return { text: "Notification not required", urgent: false };
  if (hoursRemaining === null) return { text: "Personal data breach: record when the client became aware", urgent: true };
  return { text: `${hoursRemaining} hour${hoursRemaining === 1 ? "" : "s"} left to notify the regulator`, urgent: true };
}
