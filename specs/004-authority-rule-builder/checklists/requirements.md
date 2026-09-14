# Specification Quality Checklist: Authority Rule Builder

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-14
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

### Validation pass 1 — issues found and fixed

- **Implementation detail leaked into the spec.** The first draft named
  `AuthorityAssignment`, `lib/domain/authority-table.ts` and `gateLine` in the requirements,
  which are code, not behaviour. Rewritten in the language of tasks, rules and figures. The
  file names remain in the planning input where they belong, not here.
- **FR-013 was untestable as written** ("rules should be in a sensible order"). Replaced
  with a stable, explicit order that is the same on every surface and every page load,
  which can be asserted.
- **Migration was one line and under-specified.** Losing a client's recorded threshold is
  the most expensive failure this feature can have, so it was promoted to its own P1 user
  story with five acceptance scenarios covering every combination the old shape allowed,
  plus FR-019 for re-running safely.

### Clarifications deliberately not raised

Three decisions had no explicit answer in the user's input. All three had a defensible
default, so per the spec guidance they are recorded as assumptions rather than spent as
questions against a user who has already signed the design off from a working demo:

1. Which directions a time rule offers — all five, with adapted wording.
2. What a decision step shows on the Process Map when it carries several rules — the first
   money rule's figure.
3. What rule order means — creation order.

Each is stated in Assumptions and is cheap to change if the user disagrees when they see it.

### Accepted risk

The spec assumes the user's "add another approval" answer generalises to "a task carries
any number of rules", which is also what resolves the money-plus-deadline question they did
not answer directly. This reading is recorded in the Why section and in User Story 2; if it
is wrong, Story 2 is the story that changes.
