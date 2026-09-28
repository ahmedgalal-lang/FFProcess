/**
 * Training records' expiry (spec 021) — pure, derived from the course's
 * validity period rather than stored, so changing a course's period re-dates
 * every completion of it: the rule changed, not the history.
 */

import { dayOf } from "@/lib/domain/checklist-due";
import { addDaysUtc, addMonthsUtc } from "@/lib/domain/dates";

/** A completion within this many days of its expiry is flagged Expiring soon. */
export const EXPIRING_SOON_DAYS = 30;

export type TrainingState = "CURRENT" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";

/** The completion date plus the validity period in calendar months, clamped to month end; null when it never expires. */
export function trainingExpiry(completedOn: Date, validityMonths: number | null): Date | null {
  return validityMonths === null ? null : addMonthsUtc(completedOn, validityMonths);
}

/** Expired once the expiry day has passed; Expiring soon from 30 days before it through the day itself. */
export function trainingState(completedOn: Date, validityMonths: number | null, today: Date): TrainingState {
  const expiry = trainingExpiry(completedOn, validityMonths);
  if (!expiry) return "NO_EXPIRY";
  const expiryDay = dayOf(expiry);
  if (expiryDay < dayOf(today)) return "EXPIRED";
  return expiryDay <= dayOf(addDaysUtc(today, EXPIRING_SOON_DAYS)) ? "EXPIRING_SOON" : "CURRENT";
}
