# Specification Quality Checklist: Delete Warning & Process Restore

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-16
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

Two things were resolved during writing rather than raised as clarifications, because the
codebase already answers them:

- **Do sub-processes go with the parent?** No. The Processes list already collects
  children whose parent is hidden and lists them separately, so nothing is lost today.
  The spec therefore warns about the relationship (FR-020) and guarantees the children
  survive (FR-022) rather than proposing a cascade.
- **Can a restore collide with a process created since?** No. Process codes stay reserved
  while deleted, because code generation counts every process in the workspace regardless
  of deletion state. Recorded as an assumption rather than a requirement, since this
  feature relies on the behaviour but does not introduce it.

One deliberate wording decision is recorded in Assumptions: the interface keeps saying
"delete" rather than switching to "archive". The reassurance belongs in the copy, not in
renaming the action to something a consultant would not go looking for.
