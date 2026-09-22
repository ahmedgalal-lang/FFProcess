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

**How the layout question was settled.** The first draft of this spec deliberately left the
layout open, on the grounds that it was a `/speckit-plan` decision. Three candidates were
then mocked up on the reported process at true page proportions
(`claude.ai/artifact/1BsKVYKKyKFyc6Wx8v91kK`) and put to the consultant, who asked for two
of them rather than one. So the spec now names two — **Flow** and **Roles** — and records
the third as ruled out. What is still open, and still belongs to planning, is their internal
geometry: row heights, the role ceiling, and how a branch is drawn.

**Why two and not one.** They are not two versions of the same thing. Flow answers "what
happens, in what order"; Roles answers "who owns this, and where does it change hands".
Neither dominates: Roles is the better artefact for the second conversation, and pays for it
in type size and a ceiling on roles. Shipping both, with a per-client choice, is what the
consultant asked for and is recorded as FR-018 through FR-023.

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

**One thing planning must not skip.** FR-023 — the role ceiling. Roles degrades as roles are
added: 4 reads well, 6 is at the edge, and nothing stops a consultant creating 12. The spec
requires predictable, stated behaviour past that ceiling rather than columns too narrow to
read; the number itself, and what happens past it, is planning's to decide and document.
