# Specification Quality Checklist: Printed Process Map Without Lane Bands

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-21
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

One judgement call recorded rather than raised as a clarification: whether "the report"
also covers the PPTX slide-deck export, which shares the same wrap function today. The
user's own words say "the report" and name nothing else; the slide deck is left with its
lane bands, recorded in Assumptions. If that reading is wrong, it is a one-line follow-up
to extend the change to the deck's own wrap call — the same underlying layout change
covers it, only the caller differs.

No [NEEDS CLARIFICATION] markers were needed: the mockup already resolved the one real
design decision (which option), and the user's follow-up resolved the one scope
question (report only, live canvas untouched).

## Success criteria, measured

Measured on `tests/fixtures/wide-process.ts` — twenty-five steps across six roles —
rendered to PDF and read by which physical pages carry which row label.

| | Before | After |
|---|---|---|
| **SC-001** pages the map occupies | 4 | **2** |
| Whole report, same content | 9 pages | **7 pages** |
| **SC-002** connectors crossing a card that is not their own endpoint | — | **0** (`connector-routing.spec.ts`, printed-map test) |
| **SC-003** role legible on every printed card | yes | yes, unchanged — the card already printed it |
| **SC-004** interactive Process Map affected | — | **no** — `wrapProcessMap` is not in its call graph; its own test passes untouched |
| **SC-005** row labelling, direction notice, seam, continuation markers | pass | pass |

Suites after the change: **605 unit** (was 598), **136 end-to-end** (was 133). Lint and
`tsc --noEmit` clean.

### SC-004, confirmed rather than asserted

`git diff` for this feature touches `lib/domain/process-layout.ts`,
`static-process-map-diagram.tsx`, three test files and one fixture. It does not touch
`process-map-canvas.tsx`, `map-nodes.tsx`, or `lib/export/pptx/report-pptx.ts` — the
interactive canvas and the slide deck respectively. The deck's own test ("the slide deck
carries every step of a long process too") asserts a role name appears more than once,
which is only true because it still draws a lane per row; it passes, so the deck's
banding is provably intact.

### Noted, not fixed

On a dense row the continuation marker pills ("↳ continues on row 2", "↱ from row 1")
can overlap each other when two of them anchor to steps in adjacent columns and one
carries a long connection label. This predates the feature — the pills are placed at a
fixed offset from their own step — and is not made worse by it (a wider column helps).
Recorded here rather than folded into this change.
