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

## T026 — Success criteria, measured

Each criterion below was checked against the real exported PDF (`pdftotext`/`pdfinfo` on a
document `page.pdf()` actually produced, not the rendered DOM with print media emulated —
`tests/e2e/printed-map-pdf.spec.ts`) or the equivalent real rendering, on the 18-step tender
fixture (`tests/fixtures/tender-process.ts`, the shape the original report was) and the
6-role fixture (`tests/fixtures/wide-process.ts`, one past the 5-role ceiling). A criterion
not measured is not met; every row here names the test that measured it.

| # | Result | Measured by |
|---|--------|-------------|
| SC-001 | Met. Every one of the 18 step labels, including the longest, is present in the exported PDF text for both layouts — down from 18 of 18 overflowing. | `printed-map-pdf.spec.ts` ("every step reaches the exported PDF", both layouts); `printed-map.spec.ts` ("the longest label prints whole") |
| SC-002 | Met. No card's label is separated from its meta line by a page break in the real PDF, for either layout; nothing in the CSS clips (`printed-map.css` sets no fixed height and no `overflow: hidden` anywhere in the map). | `printed-map-pdf.spec.ts` ("no step card is torn across a page break", both layouts) |
| SC-003 | Met. Rows print top to bottom in ascending step order on a hand-arranged process — no row runs backwards. | `arranged-process-map.spec.ts` ("a hand-arranged process still prints in step order, not canvas order") |
| SC-004 | Met. No stub, arrow or marker points at empty space: connectors are drawn only between grid-placed or rail-adjacent rows that exist. | `arranged-process-map.spec.ts` ("no connection is replaced by a marker the reader has to match up by eye"); `printed-map.spec.ts` (branch/merge labelling) |
| SC-005 | Met. Connectors are CSS rail/grid elements scoped to the two rows they join (`::before`/`::after` on the row's own rail, or a grid item spanning exactly `--pmap-from`/`--pmap-to`), never a measured overlay that could cross an unrelated card. | Structural — enforced by `printed-map.css` / `roles-layout.tsx` geometry; exercised by `printed-map.spec.ts` |
| SC-006 | Met. Every connection either draws as a line or is a back-reference that names its own destination and label; zero silently dropped. | `arranged-process-map.spec.ts`; `printed-map.spec.ts` ("each branch carries its own label, and the converging paths are named") |
| SC-007 | Met. The PDF text, read in order, carries every step and both decisions' branch labels ("Yes"/"No", "Locally"/"Internationally") — a reader can follow the process and name each decision's branches from the PDF alone. | `printed-map-pdf.spec.ts` (label presence); `printed-map.spec.ts` (branch labelling) |
| SC-008 | Met. Exporting a hand-arranged process changes no stored `positionX`/`positionY`. | `printed-map.spec.ts` ("exporting does not move a single stored step position"); `wrapped-process-map.spec.ts` |
| SC-009 | Met. SC-001, SC-002 and SC-007's tests are parametrized over both `FLOW` and `ROLES` and pass independently in each; SC-003–SC-006 hold by construction in both (Roles falls back to Flow past its role ceiling rather than shipping a broken Roles render). | `printed-map-pdf.spec.ts`, `printed-map.spec.ts` (both `for (const layout of ["FLOW", "ROLES"])`) |
| SC-010 | Met. An Editor's click on the "Map layout" control redraws the map in place (no navigation), the choice survives a reload of the same page and a sign-in from a fresh session, and a Viewer is offered no such control — and, calling the action directly, an EDITOR-or-above may set it, a VIEWER is refused with the stored value untouched, an unrecognized layout is rejected, and one workspace's choice never reaches another's. | `tests/e2e/report-map-layout.spec.ts`; `tests/integration/report-map-layout.test.ts` (T022) |

**One thing this pass added.** SC-010 had no test at all until this pass — the toggle control
existed and worked by inspection, but nothing exercised the click, the persistence, or the
Viewer gate. `report-map-layout.spec.ts` closes that gap.

**A known parity gap, not a criterion.** Roles does not name its merges the way Flow does
("joins step 15 and step 16") — its cards show the merge visually (two connectors landing on
one row) but not in words. No success criterion requires it; recorded here so it is not
mistaken for an oversight later.
