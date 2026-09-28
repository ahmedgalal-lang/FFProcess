/**
 * Whether a policy is currently overdue for review (spec 018 FR-012) — pure,
 * no DB/clock, so `today` is a parameter (Constitution Principle III).
 *
 * Only a PUBLISHED policy can be overdue: a review-due date left on a Draft,
 * In Review, Approved, or Retired policy is not "in force" and so is never
 * flagged, however far in the past that date sits.
 */
export function isPolicyOverdueForReview(
  lifecycleStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "RETIRED",
  reviewDueDate: Date | null,
  today: Date
): boolean {
  if (lifecycleStatus !== "PUBLISHED") return false;
  if (!reviewDueDate) return false;
  return reviewDueDate.getTime() < today.getTime();
}
