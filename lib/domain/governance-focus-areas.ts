/**
 * The five governance focus areas (FR-002), named once. The AI system prompt
 * asked for these five as given (spec.md Assumptions) — this is the single
 * place their value/label pairing lives, read by the server action, the
 * Governance page's server data-fetching, and the client panel's tabs, so
 * the three can't drift into three different labels for one enum value.
 */
export const GOVERNANCE_FOCUS_AREAS = [
  { value: "BOARD_STRUCTURE", label: "Board Structure" },
  { value: "RISK_CONTROLS", label: "Risk & Internal Controls" },
  { value: "ETHICS_POLICY", label: "Ethics Policy" },
  { value: "COMPENSATION", label: "Compensation" },
  { value: "ESG", label: "ESG" },
] as const;

export type GovernanceFocusAreaValue = (typeof GOVERNANCE_FOCUS_AREAS)[number]["value"];

export const GOVERNANCE_FOCUS_AREA_LABEL: Record<GovernanceFocusAreaValue, string> = Object.fromEntries(
  GOVERNANCE_FOCUS_AREAS.map((f) => [f.value, f.label])
) as Record<GovernanceFocusAreaValue, string>;
