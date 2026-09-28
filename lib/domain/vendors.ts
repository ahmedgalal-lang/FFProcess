/**
 * The vendor register's derived flags (spec 023) — pure, computed on the
 * server like every other overdue flag in the governance registers.
 */

import { dayOf } from "@/lib/domain/checklist-due";
import { addDaysUtc, addMonthsUtc } from "@/lib/domain/dates";

export type VendorCriticalityT = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ContractState = "NONE" | "ACTIVE" | "RENEWAL_SOON" | "EXPIRED";

/** A contract ending within this many days is flagged for renewal. */
export const RENEWAL_WINDOW_DAYS = 60;

const CRITICALITY_RANK: Record<VendorCriticalityT, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** One review cycle after the last completed review; null without both. */
export function nextDueDiligenceOn(lastOn: Date | null, cycleMonths: number | null): Date | null {
  return lastOn && cycleMonths ? addMonthsUtc(lastOn, cycleMonths) : null;
}

/** Overdue by calendar day once the next review date has passed; due today isn't late yet. */
export function isDueDiligenceOverdue(lastOn: Date | null, cycleMonths: number | null, today: Date): boolean {
  const next = nextDueDiligenceOn(lastOn, cycleMonths);
  return next !== null && dayOf(next) < dayOf(today);
}

/** Expired once the end date has passed; renewal due from 60 days before it through the day itself. */
export function contractState(endOn: Date | null, today: Date): ContractState {
  if (!endOn) return "NONE";
  const end = dayOf(endOn);
  if (end < dayOf(today)) return "EXPIRED";
  return end <= dayOf(addDaysUtc(today, RENEWAL_WINDOW_DAYS)) ? "RENEWAL_SOON" : "ACTIVE";
}

/** Most critical first, then by name. Returns a new array. */
export function sortVendors<T extends { name: string; criticality: VendorCriticalityT }>(vendors: readonly T[]): T[] {
  return [...vendors].sort(
    (a, b) => CRITICALITY_RANK[a.criticality] - CRITICALITY_RANK[b.criticality] || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}
