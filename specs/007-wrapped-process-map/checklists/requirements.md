# Specification Quality Checklist: Wrapped Process Map

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-17
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

The shape of this feature was settled with the user before the spec was written: they were
shown a screenshot of a 22-step process rendered at roughly 30px per step and chose
"wrap onto several rows" over three alternatives (a taller box, splitting across pages,
leaving it alone). The three rejected options are recorded in Out of Scope so the choice
is not quietly revisited during planning.

Four judgements were made during writing rather than raised as questions:

| Judgement | Why it is not a question |
| --- | --- |
| Rows read left to right, top to bottom | The convention every reader already has. Alternating direction saves one connector and costs an explanation. |
| Order comes from the stored arrangement | It is the order the interactive map and the Steps List already show. Re-deriving order from the connection graph would make the printed map disagree with the screen. |
| Lanes repeat on every row | Costs vertical space, saves a reader looking back. On paper they cannot scroll, so the trade goes the other way from a screen. |
| Very long processes fall back to shrinking | Completeness is never traded for legibility. A shrunk map is worse; a map missing a step is wrong. |

**FR-003 and SC-005 are the regression guard.** Most processes in most packs are short
enough not to wrap, so the most likely way this feature does damage is by changing
diagrams nobody asked it to change. Both are stated strictly: an unwrapped map must be
identical, not merely similar.

**User Story 4 exists for the same reason at a different level.** The expensive failure is
not a wrapped map drawn badly — it is a consultant's hand-arranged step positions being
rewritten by a decision made for print.
