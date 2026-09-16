# Specification Quality Checklist: Report Composer

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

No clarification markers were needed. The four decisions that would otherwise have been
raised here were settled with the user against an interactive mockup before this spec was
written, and each is now a requirement rather than a question:

| Decision | Requirements |
| --- | --- |
| Everything renumbers | FR-009 – FR-012 |
| Saved per client | FR-013 – FR-019 |
| Ticked but empty still prints | FR-023, FR-024 |
| RACI and Authority pinned together | FR-005, FR-006 |

Three judgements were made during writing rather than asked, and are recorded in
Assumptions: one arrangement per workspace rather than named arrangements; last-save-wins
rather than locking; and control points following their section rather than being a block,
because they are derived at export time rather than recorded.

SC-007 ("a workspace nobody has arranged produces byte-comparable content to what it
produces today") is deliberately strict. It is the guard against this feature quietly
changing every existing client pack, which is the most expensive way it could go wrong.

### Corrected during planning

FR-022 originally said "the spreadsheet export MUST honour the arrangement". There is no
whole-report spreadsheet: the two XLSX downloads are per-process RACI and Authority
matrices reached from a process's own page, and they are not part of the pack. The
requirement was inverted to say they must stay unaffected, which is the behaviour that
actually needs protecting — arranging a pack should not change what a colleague gets when
they export one matrix. SC-003 and one acceptance scenario were corrected to name the two
real report formats.

### SC-007 corrected during implementation

SC-007 originally said an un-arranged workspace must produce "byte-comparable content to
what it produces today". That is incompatible with a decision the user had already made:
User Story 4 exists precisely to change what an un-arranged workspace prints, because a
section with no data stops vanishing and starts printing marked. The seeded `PUR100`
renders as a bare title block today and will render four marked-empty sections after.

A second intended difference surfaced at the same time: Governance prints as `3.1`, a
sub-heading of the RACI section. Making it independently orderable makes it a section in
its own right, numbered `4.0`.

SC-007 now names both differences and says every other one is a regression — which is the
guard that was actually wanted. The snapshot test still exists and still runs against a
baseline captured from the pre-feature renderer; the diff between the two is read by eye
and recorded rather than accepted silently.
