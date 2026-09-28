/**
 * Whether a governance checklist item has slipped (spec 028) — pure, with
 * `today` passed in. Compared by calendar day (UTC), not by timestamp: a due
 * date is stored as that day's midnight, and an item due today isn't late
 * until tomorrow. Done and dismissed items are never overdue.
 */
export function isChecklistItemOverdue(
  status: "OPEN" | "EDITED" | "DONE" | "DISMISSED",
  dueDate: Date | null,
  today: Date
): boolean {
  if (!dueDate || status === "DONE" || status === "DISMISSED") return false;
  return dayOf(dueDate) < dayOf(today);
}

/** YYYY-MM-DD in UTC — sorts and compares as a calendar day. */
export function dayOf(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}
