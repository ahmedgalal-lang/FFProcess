# Specification Quality Checklist: Printed Process Map, Rebuilt

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

**On the one judgement call that could have been a clarification.** The obvious question to
ask is "what should the new layout be — down the page, across it, in role columns?" It is
deliberately *not* asked here, and not marked NEEDS CLARIFICATION, because it is a design
decision that belongs to `/speckit-plan`: the spec's job is to say what a reader must be
able to do with the printed map, and the planning phase's job is to find the arrangement
that delivers it. Writing the answer into the spec would prejudge the rebuild the user
asked for.

**Why the "before" numbers are in the spec.** Every success criterion is written against a
measurement taken from the current build on a real reported shape
(`tests/fixtures/tender-process.ts`), so "better" is a number rather than an opinion, and
the same measurement re-run after the rebuild either passes or does not.

**What is deliberately not a success criterion.** Page count. Today's map is 7 pages and
unreadable; a readable map that runs longer is a better deliverable, and fixing a page
budget now would rule out layouts before they have been evaluated. This is recorded as an
assumption rather than left implicit.

**Named non-goals.** The interactive Process Map canvas (the consultant has already asked
for it to be left alone) and the PPTX deck (a slide is a different shape from a page).
Both are stated in Assumptions so the planning phase does not quietly widen scope.
