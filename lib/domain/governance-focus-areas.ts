/**
 * The governance focus areas (FR-002), named once. This is the single place
 * their value/label pairing lives, read by the server action, the Governance
 * page's server data-fetching, and the client panel's tabs, so the three
 * can't drift into three different labels for one enum value.
 *
 * Data Integrity and Accessibility were added after the first five: a client
 * assessing how it governs its own data, and how it meets accessibility
 * obligations, is asking the same shape of question as one assessing its
 * board — a summary, a phased checklist, the policies it should hold and the
 * risks it is carrying. Adding a value here and to the Prisma enum is the
 * whole change; nothing downstream counts these.
 */
export const GOVERNANCE_FOCUS_AREAS = [
  { value: "BOARD_STRUCTURE", label: "Board Structure" },
  { value: "RISK_CONTROLS", label: "Risk & Internal Controls" },
  { value: "ETHICS_POLICY", label: "Ethics Policy" },
  { value: "COMPENSATION", label: "Compensation" },
  { value: "ESG", label: "ESG" },
  { value: "DATA_INTEGRITY", label: "Data Integrity" },
  { value: "ACCESSIBILITY", label: "Accessibility" },
] as const;

export type GovernanceFocusAreaValue = (typeof GOVERNANCE_FOCUS_AREAS)[number]["value"];

export const GOVERNANCE_FOCUS_AREA_LABEL: Record<GovernanceFocusAreaValue, string> = Object.fromEntries(
  GOVERNANCE_FOCUS_AREAS.map((f) => [f.value, f.label])
) as Record<GovernanceFocusAreaValue, string>;
