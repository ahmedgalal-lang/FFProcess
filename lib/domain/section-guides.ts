/**
 * The Governance page's section guides (spec 030): for each section, why it
 * matters, how to fill it in, and how to judge the result. Fixed product
 * copy, the same for every workspace, approved as a mockup before building.
 */

import { SECTION_GUIDES_AR } from "./section-guides.ar";

export type SectionGuideContent = {
  title: string;
  /** One line under the title: what the section is. */
  what: string;
  why: string[];
  /** Ordered steps. */
  how: string[];
  good: string[];
  bad: string[];
  /** The standard, framework or law the section follows, when there is one. */
  ref: string | null;
};

export const SECTION_GUIDES = {
  attention: {
    title: "What needs attention",
    what: "A summary of everything in this workspace that needs action now.",
    why: [
      "Governance fails quietly. A risk nobody reviews or a policy past its review date rarely causes a problem on the day it slips. This panel gathers those gaps in one place so they are seen before a board meeting, an audit or an incident exposes them.",
      "It is also the fastest way to brief a client sponsor: each figure is a question they should be able to answer."
    ],
    how: [
      "Nothing to fill in. The panel counts what the registers below contain.",
      "Keep the registers current. The counts are only as good as the records behind them.",
      "Click any tile to open the records it counts. Risk-level tiles show matching risks across all aspects."
    ],
    good: [
      "No High risks without a treatment plan",
      "Zero overdue corrective and treatment actions",
      "Checklist progress rising between review meetings"
    ],
    bad: [
      "The same overdue items in every session",
      "Aspects with no published governing policy",
      "“Nothing recorded yet” on an active engagement"
    ],
    ref: null,
  },
  profile: {
    title: "Governance profile",
    what: "The facts about the client that every assessment is grounded in.",
    why: [
      "What good governance looks like depends on scale, sector and law. A 40-person startup does not need a nomination committee; a listed company must have one. The profile keeps the AI assessment from producing generic advice that doesn't fit the client."
    ],
    how: [
      "Set the industry on the workspace dashboard if it isn't there yet.",
      "Choose the company size that matches headcount and ownership (for example, public corporation if listed).",
      "Enter the main jurisdiction whose company law and regulators apply. If the client operates in several, use the one where it is incorporated and note the others in the assessment.",
      "Save. Generate is enabled only once all three are set."
    ],
    good: [
      "Assessments name laws and bodies that actually apply to the client",
      "Recommendations are proportionate to the client's size"
    ],
    bad: [
      "Advice citing another country's rules",
      "Board requirements far beyond the client's scale: check the size setting"
    ],
    ref: null,
  },
  assessment: {
    title: "Governance assessment",
    what: "A structured review of one area of governance at a time, called an aspect.",
    why: [
      "Clients rarely need everything at once. Splitting governance into aspects lets you assess, prioritise and report each area on its own, and every summary is framed against the same four pillars (accountability, transparency, fairness, responsibility), so aspects can be compared."
    ],
    how: [
      "Pick an aspect tab, or add one the client actually talks about (for example “Data Privacy”). Rename or delete tabs that don't fit the engagement.",
      "Click Generate assessment. It drafts a summary, a phased checklist, risks and policies for that aspect.",
      "Read the executive summary and rewrite it in your own words where needed. A hand-edited summary is never overwritten by a later regenerate.",
      "Check the aspect's governing policy (for example the Board Charter for Board Structure). Draft it, or open the existing one, and take it through review and approval to Published.",
      "Regenerate after significant changes. Items you've marked done, dismissed or edited are kept as they are."
    ],
    good: [
      "Every aspect in scope has a summary you'd put your name to",
      "Every aspect has a published governing policy",
      "Findings reference the client's real structure and people"
    ],
    bad: [
      "Summaries left exactly as generated for client-facing work",
      "Aspects that don't apply still in the list, diluting the report"
    ],
    ref: "Frameworks: OECD/G20 Principles of Corporate Governance; national codes such as the UK Corporate Governance Code.",
  },
  governing: {
    title: "Governing policy",
    what: "The one policy that sets the rules for this aspect as a whole.",
    why: [
      "Every area of governance needs a document that says who decides what, what the rules are, and how they are checked: a Board Charter for the board, a Risk Management Policy for risk. Without it, practice depends on individuals and can't be audited or enforced.",
      "Regulators, auditors and investors ask to see these documents first, and a published, approved policy is the evidence that an area is actually governed."
    ],
    how: [
      "Open the aspect's tab. If it has no governing policy, start one from the suggested template, draft one with AI, write one, or choose an existing policy from the library.",
      "Adapt it to the client: replace every [bracketed] placeholder, remove what doesn't apply, and name real roles and committees.",
      "Submit it for review. A Workspace Admin approves it, then publishes it with an effective date.",
      "Set a review-due date, usually 12 months out, and record acknowledgements where everyone must follow it.",
      "When it's replaced, publish the new version or choose the replacement as the governing policy."
    ],
    good: [
      "Every aspect in scope has a Published governing policy",
      "Placeholders all replaced with the client's real roles and bodies",
      "Review dates set and kept"
    ],
    bad: [
      "Templates published unchanged, with [placeholders] still in them",
      "Aspects still showing the amber dot on their tab",
      "A Retired governing policy with no replacement"
    ],
    ref: "Frameworks: OECD/G20 Principles of Corporate Governance; the standard or law named in each template.",
  },
  checklist: {
    title: "Governance checklist",
    what: "The concrete actions that close the gaps the assessment found.",
    why: [
      "An assessment without an action list changes nothing. The checklist turns findings into owned, dated work, and the phases tell the client what to do first."
    ],
    how: [
      "Review each generated item. Dismiss what doesn't apply rather than deleting it, so a regenerate won't bring it back.",
      "Add items the client already knows they need, using + Add item.",
      "Give each open item an owner (a role or a named person) and a due date.",
      "Mark items Done as they're completed. Open a drafted policy from its item to edit it."
    ],
    good: [
      "Every Immediate item has an owner and a due date",
      "Overdue count trending to zero",
      "Dismissed items have an obvious reason"
    ],
    bad: [
      "Items with no owner: nobody will do them",
      "Long-term items done while Immediate ones sit open",
      "Many items dismissed with no discussion"
    ],
    ref: null,
  },
  risk: {
    title: "Risk register",
    what: "Every risk the client faces, scored, owned and tracked until it's treated.",
    why: [
      "A risk register is the core of any governance programme. It makes uncertainty visible, puts a name next to each risk, and lets the board see whether exposure is going up or down. Regulators, auditors and lenders routinely ask to see one.",
      "The heat map shows at a glance whether risk is concentrated in the high-likelihood, high-impact corner."
    ],
    how: [
      "Start from the risks the assessment surfaced, then add any the client names in interviews with + Add risk.",
      "Score each one: likelihood (how probable in the next 12 months) and impact (how bad if it happens). The level is derived from the two.",
      "Assign an owner who has the authority to act on it.",
      "Open Treatment on each High and Medium risk. Choose a strategy (mitigate, transfer, accept or avoid), set the target level, and add actions with owners and due dates.",
      "Review scores and status at least quarterly, and whenever an incident happens."
    ],
    good: [
      "Every High risk has an owner and a treatment plan",
      "Target levels are realistic and actions are on time",
      "Scores change over time: the register is being used"
    ],
    bad: [
      "Risks sitting in the red corner with no treatment",
      "“Accepted” High risks with no rationale recorded",
      "Owners who can't act on the risk (too junior, or a department rather than a role)"
    ],
    ref: "Standards: ISO 31000 Risk management; COSO ERM.",
  },
  policy: {
    title: "Policy library",
    what: "The client's governing documents, including each aspect's governing policy, with version history, approvals and acknowledgements.",
    why: [
      "Policies set the rules everyone is held to. A policy only counts if it has been approved by someone with authority, communicated, and kept up to date; an unsigned draft in a shared folder does not protect the client."
    ],
    how: [
      "Edit a drafted policy, or write one with + Add policy. Every save keeps a version.",
      "Submit it for review. A Workspace Admin approves it, then publishes it with an effective date.",
      "Set a review-due date (usually 12 months out).",
      "Record who has acknowledged each published policy, such as a Code of Conduct.",
      "Retire policies that are replaced. Editing a published policy returns it to Draft for re-approval."
    ],
    good: [
      "Every aspect's governing policy published and in date",
      "High acknowledgement rates for policies that apply to everyone",
      "Clear approval trail for each version"
    ],
    bad: [
      "Policies stuck in Draft or In review for months",
      "Published policies past their review date",
      "Nobody recorded as acknowledging the Code of Conduct"
    ],
    ref: null,
  },
  activity: {
    title: "Activity",
    what: "A permanent record of who changed what, and when.",
    why: [
      "An audit trail shows the governance work was real and done by accountable people. It answers questions like “who approved this policy?” or “when was this risk downgraded?” without relying on memory."
    ],
    how: [
      "Nothing to fill in. Every change is recorded automatically and can't be edited or deleted.",
      "Click Show activity to read it, newest first, and Load more for older entries."
    ],
    good: [
      "Regular, spread-out activity from the right people",
      "Approvals made by Admins, not by the policy's author"
    ],
    bad: [
      "Bursts of changes just before a board pack or audit",
      "Risk levels lowered with no treatment actions behind them"
    ],
    ref: null,
  },
  controls: {
    title: "Key Control Points & KPIs",
    what: "The approval and review points built into each process, and the measures that show it performs.",
    why: [
      "Controls are how policies are enforced day to day: who approves a payment, who reviews a contract. KPIs and SLAs show whether the process delivers. Together they connect governance on paper to what actually happens."
    ],
    how: [
      "Controls come from each process's Authority Matrix. Mark approval and review steps there and they appear here.",
      "Add KPIs for each process: the metric, its target and how often it's measured.",
      "Link significant controls back to the risks they mitigate when you treat those risks."
    ],
    good: [
      "Every high-value approval has a control point with a clear approver",
      "KPIs have measurable targets and a frequency"
    ],
    bad: [
      "The same person initiating and approving (no segregation of duties)",
      "KPIs with no target, or never measured"
    ],
    ref: "Framework: COSO Internal Control – Integrated Framework.",
  },
} satisfies Record<string, SectionGuideContent>;

export type SectionGuideId = keyof typeof SECTION_GUIDES;

/** The guide in the reader's language (spec 031). */
export function sectionGuideFor(id: SectionGuideId, locale: "en" | "ar"): SectionGuideContent {
  return locale === "ar" ? SECTION_GUIDES_AR[id] : SECTION_GUIDES[id];
}
