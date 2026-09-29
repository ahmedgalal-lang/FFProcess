# Research: A Governing Policy for Every Aspect

## Decision 1 — The link lives on the policy, as a unique nullable column

`GovernancePolicyDraft.governsAspectId String? @unique`, relation to
`GovernanceAspect` with `onDelete: SetNull`. Uniqueness gives both halves of
FR-001 at once (an aspect can be named by one policy, a policy names one
aspect). SetNull keeps the policy when its aspect is deleted (FR-009), and
deleting the policy needs no extra step: the aspect simply has no row
pointing at it. Alternative considered: `governingPolicyId` on the aspect;
rejected because it would need its own uniqueness and an extra cleanup on
policy delete.

## Decision 2 — Templates are code, not data

A catalogue in `lib/domain/policy-templates.ts`: 14 entries (one per default
aspect, plus Conflict of Interest, Whistleblowing, Anti-Bribery &
Corruption, Third-Party Management, Incident Management, Data Protection,
Training & Awareness). Each has an id, title, one-line purpose, the aspect
names and keywords it suits, and a structured body (purpose, scope,
definitions, policy statements, roles and responsibilities, monitoring and
review, approval). `{{company}}` in a body is replaced with the workspace
name when a policy is created from it. Templates are read-only (spec
Assumptions); no table, no migration for them.

Suggestion order (`rankTemplates(aspectName)`): an exact default-aspect
match first, then keyword matches, then the rest in catalogue order. A
custom aspect with no match gets the plain catalogue order.

## Decision 3 — AI: one new small call, and the assessment gains a field

- `runGoverningPolicyDraft` in `lib/ai/governance-generator.ts`: one policy
  `{ title, body }` for one aspect, grounded in the same profile. Same
  NOT_CONFIGURED/REQUEST_FAILED handling as the assessment.
- The assessment schema gains `governingPolicy: { title, body } | null`.
  `generateGovernanceAssessment` creates it only when the aspect has no
  governing policy (FR-006), inside the existing transaction. The TS type
  makes it optional so existing mocks keep working.

## Decision 4 — Actions in a new file; the activity logger is shared

`lib/actions/governing-policy.ts`: `setGoverningPolicy` (designate,
replace, or clear with `policyId: null`), `createGoverningPolicy`
(template or hand-written), `draftGoverningPolicyWithAi`. All EDITOR. The
private `logActivity` helper moves from `governance.ts` to
`lib/data/governance-activity.ts` as `logGovernanceActivity`, so both files
log the same way, in the same transaction as the change (FR-012).

## Decision 5 — Completeness is "has a Published governing policy"

Pure `aspectPolicyState(policy | null)` → `NONE | NOT_PUBLISHED |
PUBLISHED` in `lib/domain/governing-policy.ts`. Retired counts as not
Published. Used by the tab marker, the summary tile and the report.

## Decision 6 — Where it shows

- Aspect tab: a "Governing policy" block at the top of the aspect's
  assessment area, with the empty state and the four creation routes.
- Tab names gain a marker when the aspect lacks a Published governing
  policy (sr-only ", no published policy" plus a small visible badge).
- Policy Library: "Governs: <aspect>" on governing policies.
- Summary panel: "Aspects without a published governing policy" tile,
  linking to `#governance-assessment`, shown once the workspace has any
  governance records (the panel's existing empty rule).
- Report: a "Governing Policies" subsection in Governance & Risk, one row
  per aspect, and the same on the PPTX governance slide.
