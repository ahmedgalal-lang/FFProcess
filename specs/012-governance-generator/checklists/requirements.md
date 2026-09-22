# Specification Quality Checklist: AI Governance Framework Generator

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Two judgement calls recorded as Assumptions rather than raised as clarifications,
because a reasonable default exists and the user's own request pointed at it:

- **One focus area per run**, not all five at once — this is how the only precedent
  feature in the product (AI Process Review) already works, and keeps each output
  readable rather than one giant document covering Board Structure through ESG at once.
- **Reuses the existing Gemini integration** rather than opening the question of which
  AI provider to use — the supplied system prompt describes a role and an output shape,
  not a specific model or vendor, and the product already has exactly one integration
  pattern for this shape of work.

This spec deliberately stops short of designing the persistence schema or the UI layout
— those are Phase 1 (plan.md) and the requested mockup, respectively.

---

## Post-implementation: success criteria, as measured

Recorded after implementation (T029). A criterion with no measurement behind it is
recorded as not met, not assumed.

- [x] **SC-001** — three actions, unset profile to a persisted three-part assessment.
  Measured in `tests/e2e/governance-assessment.spec.ts` (profile gate visible and
  Generate disabled; saving size + jurisdiction with industry set enables it) and in
  `tests/integration/governance.test.ts` ("persists the summary, a checklist item per
  phase, its linked policy, and both a linked and an unlinked risk"), which asserts all
  three parts land from one `generateGovernanceAssessment` call.

- [~] **SC-002** — every summary names the workspace's actual size and industry.
  **Partially measured.** What is proven: the prompt sent to the model carries the
  workspace's real industry, company size and jurisdiction strings, asserted against
  the captured call argument in the integration test. What is *not* proven: that the
  model's returned prose actually uses them, which needs a live `GEMINI_API_KEY` — not
  available in this environment, and not something a mocked response can demonstrate.
  This criterion needs a sample of real runs against a configured deployment before it
  can be marked met.

- [x] **SC-003** — a done item stays done, with no duplicate, in 100% of cases.
  Measured in the integration test ("does not recreate a DONE or DISMISSED item, and
  does not duplicate an OPEN one, on regenerate"), where the second run returns the
  exact same titles. Mutation-checked: emptying the tracked-title set makes it fail
  with 4 items where 2 are expected.

- [x] **SC-004** — an edited policy is never silently replaced.
  Measured in the integration test ("does not overwrite an edited policy body, or a
  hand-scored risk, on regenerate"): the hand-edited body and EDITED status survive a
  regeneration that re-drafts the same policy title, and no duplicate policy is created.

- [x] **SC-005** — cross-area Risk Register and Policy Library, without switching tabs.
  Both are rendered by `governance-assessment-panel.tsx` outside the focus-area tab
  panel, reading workspace-wide queries (`page.tsx` reads every assessment's items and
  every workspace risk, not the active area's). The Risk Register's cross-area behaviour
  is exercised end-to-end in the e2e spec's hand-added-risk case; a policy's source area
  is carried as `focusAreaLabel` per row.

- [x] **SC-006** — a hand-scored risk is never overwritten.
  Measured in the integration test, twice: a risk re-scored through
  `updateGovernanceRisk` keeps its likelihood and status across a regeneration, and a
  risk added by hand before any run survives a run that returns the same title, without
  being duplicated.

### Suite results at implementation (T027)

- `pnpm test` — 44 files, 638 tests, all passing (includes 9 new governance integration
  tests and the governance-findings / governance-risk unit tests).
- `pnpm test:e2e` — 150 tests; all governance, accessibility and viewer-gating specs
  pass. One unrelated pre-existing flake (`delete-warning.spec.ts`, passes in isolation)
  and one unrelated stale-snapshot failure (`report-composer.spec.ts`, caused by
  long-lived dev-database drift in a seeded process's KPI rows, not by this feature).
- `pnpm lint` and `pnpm exec tsc --noEmit` — both clean.

### Visual read-through (T028)

Read against the approved mockup on the live page: the profile form, five-pillar strip,
focus-area tabs, empty-state copy, Risk Register and Policy Library all render as
designed. Two defects found by looking at the real page rather than the source — a
stale generated Prisma Client that made the page 500 for every role, and muted label
text below WCAG AA contrast — are fixed in the same branch.
