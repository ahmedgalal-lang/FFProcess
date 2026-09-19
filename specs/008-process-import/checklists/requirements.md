# Specification Quality Checklist: Build a Process from a Spreadsheet

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-19
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

No clarification markers. Five judgements were made during writing rather than raised as
questions, and each is recorded in Assumptions:

| Judgement | Why it is not a question |
| --- | --- |
| A spreadsheet, not some other format | The material already arrives from workshops in spreadsheets. Any other format reintroduces the re-keying this feature removes. |
| One process per file | A workbook describing several processes is a different feature, not a detail of this one. |
| Names are the join | A consultant filling in a spreadsheet has no access to the product's internal identifiers. |
| Create only, never update | Updating implies deciding what to do about steps edited since, which is materially riskier and belongs in its own spec. |
| All or nothing, never partial | A half-built process is harder to deal with than a rejected file. |

**User Story 2 is priced P1 alongside User Story 1 deliberately.** The import is the
largest single write in the product, and the failure worth designing against is not "the
import did not work" but "the import half-worked". FR-018, FR-019 and FR-020 all say the
same thing from different directions, which is intentional: each is separately testable and
each covers a different way the same damage could occur.

**FR-006 is the cheapest real test in the feature.** The template carries a worked example,
and that example must import untouched — so the format and the importer are proven to agree
without anyone filling anything in.

**FR-021 exists to stop a second copy of the rules appearing.** The product already knows
that a task has exactly one Accountable and that a money rule carries a figure. An importer
that restated those rules would drift from them, and an imported process could then sit in
a state the app would refuse to let anyone create by hand.
