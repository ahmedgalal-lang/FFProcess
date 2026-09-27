/**
 * A workspace's seven starting governance aspects (spec 017) — named once so
 * the migration's backfill and a new workspace's own seeding
 * (createWorkspace, lib/actions/organization.ts) can't drift into two
 * different starting lists. Aspects themselves are now real per-workspace
 * rows (GovernanceAspect), addable, renameable, and deletable like any other
 * workspace-scoped entity — this is only the default set a workspace starts
 * with, not a fixed, product-wide list.
 *
 * Data Integrity and Accessibility were added after the first five: a client
 * assessing how it governs its own data, and how it meets accessibility
 * obligations, is asking the same shape of question as one assessing its
 * board — a summary, a phased checklist, the policies it should hold and the
 * risks it is carrying.
 */
export const DEFAULT_GOVERNANCE_ASPECT_NAMES = [
  "Board Structure",
  "Risk & Internal Controls",
  "Ethics Policy",
  "Compensation",
  "ESG",
  "Data Integrity",
  "Accessibility",
] as const;
