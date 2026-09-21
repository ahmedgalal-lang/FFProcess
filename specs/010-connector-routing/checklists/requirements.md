# Specification Quality Checklist: Connector Routing on the Process Map

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

Iteration 1 found two failures, both fixed before this file was marked complete:

- **Implementation details leaked into the spec.** The first draft named
  `chooseHandles`, ReactFlow's `smoothstep` edge type, and `lib/domain/` file paths in
  the requirements. Those are the *plan's* business. Rewritten in terms of drawn
  positions, bands and routes.
- **SC-002 was not measurable as first written** ("connectors do not overlap"). Overlap
  needs a threshold to be testable; restated as "run along a shared line for a distance
  long enough to read as one arrow", with today's count (4 pairs) as the baseline the
  measurement has to beat.

One deliberate judgement recorded rather than raised as a clarification: the feature
description gave the corridor rule ("the band below the upper of the two lanes") and the
adjacency rule ("one column apart in the same lane") from the reviewed mockup. Both are
recorded in Assumptions rather than marked NEEDS CLARIFICATION, because the user chose
them by choosing Option A.

## Success criteria, measured

Measured on `tests/fixtures/tangled-process.ts` — ten steps over three roles, thirteen
connectors including two long forward jumps, a loop back across five columns and three
connectors meeting one card — read out of the rendered page, in canvas units so the
answer does not depend on the zoom the map happens to be drawn at.

| | Before | After | Where |
|---|---|---|---|
| **SC-001** connectors entering a card that is not one of their own endpoints | 3 | **0** | `connector-routing.spec.ts` |
| **SC-002** pairs sharing a line for a readable distance | 15 | **0** | `connector-routing.spec.ts` |
| **SC-003** every connector traceable end to end | — | met | the same two measurements are the definition |
| **SC-004** same arrangement, same route | — | met | asserted in `connector-routing.test.ts` |
| **SC-005** printed routes match the screen | — | met by construction | one router; the printed map measures 0 and 0 too |
| **SC-006** moving a step re-routes without reload | — | met | drag test asserts the card moved *and* its connectors' paths changed |
| **SC-007** nothing drawn outside the map's bounds | — | met, with one note below | PDF read at 110dpi |

Suites after the change: **598 unit** (was 578), **133 end-to-end** (was 128). Lint and
`tsc --noEmit` clean.

### The note on SC-007

Reading the PDF turned up a short teal tick below the bottom of a row-group box, at the
column where the next row begins. It is not a connector and not new: it is the seam
marker, drawn deliberately *between* two row-group boxes to join them, and it is present
identically in a PDF rendered from the commit before this work. It only reads oddly when
a page break falls between the two boxes it joins, leaving it dangling at the foot of a
page. It belongs to the row-group split, not to routing, and is recorded here rather than
fixed under this feature.

### One thing that got slightly longer

On the print diagram a compact decision card is wide enough to overlap its neighbours in
the same lane by a few pixels, so a connector between a decision and the step beside it
can no longer be drawn straight across — it drops into the band and comes back up. It is
a longer path than before. It is also the first time that arrow has been *visible*:
previously it was squeezed into the eight pixels between the two cards, where the
arrowhead sat on top of both. The underlying cause is the compact layout's spacing not
allowing for a decision's width, which is a layout question and not a routing one.
