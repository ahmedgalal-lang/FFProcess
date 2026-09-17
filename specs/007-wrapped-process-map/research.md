# Research: Wrapped Process Map

Six questions the spec left to implementation, each answered from the code.

## 1. What decides how many steps fit a row?

**Decision**: the printable page width divided by `STEP_X_SPACING` (262), floored, with a
minimum of two. The result is the row's step capacity; a process with more steps than that
wraps.

**Rationale**: the spec forbids a fixed step count (FR-004) and asks for a *readable size*.
`STEP_X_SPACING` already is that size — it is the spacing the interactive map places steps
at, where nobody complains about legibility. So "readable" needs no new constant: it is
what a step is already drawn at when nothing is shrinking it.

The printable width is `PAGE_CONTENT_WIDTH_PX` ≈ 1030px, which gives a capacity of 3.
That is too few to be useful, and the reason is that the report renders the map into a
column narrower than the page. The capacity therefore comes from the *diagram box* width
the report gives the map, not the raw page — measured once and passed in, so the same
function serves the report, the deck and the tests.

**Alternatives considered**:
- *A fixed steps-per-row constant.* Rejected by FR-004, and wrong on its face: the right
  number depends on how wide the box is, which differs between the report and a slide.
- *Measuring each step's rendered label.* Real, and much more work, for a diagram whose
  cards are already a fixed size.

## 2. Does the wrap re-order the steps?

**Decision**: no. Steps are taken in the order they already sit in — by stored `positionX`,
then `positionY` — and re-flowed into rows.

**Rationale**: the spec's assumption, and the reason is that the printed map must agree
with the screen. A consultant who dragged a step into place, or used the Steps List to
reorder, has already said what the order is. Re-deriving it from the connection graph would
produce a map that disagrees with both, and would have no answer at all for a process whose
steps are not yet connected — which the seeded data shows is common.

## 3. How do lanes work per row?

**Decision**: each row computes its own lane order, from the roles actually present on that
row, in the order they first appear across the whole process.

**Rationale**: FR-009 says a row must not reserve space for an empty lane, and FR-006 says
every row carries labelled lanes. Computing the order per row from the whole-process order
keeps the lanes in a consistent sequence between rows — a reader sees the same roles in the
same order wherever a role appears — while dropping the ones a row does not need.

`assignSwimlanes` already produces the whole-process lane order and the "has an unassigned
lane" flag. The per-row version filters it rather than reimplementing it.

## 4. How is a connection between rows drawn?

**Decision**: it is drawn as an edge like any other, but with a marker at each end naming
the other row, rather than as a line routed across the page.

**Rationale**: FR-011 says a cross-row connection must be followable and must not be a
straight line across intervening steps. Two ways to satisfy it:

- *Route the line* — down the right edge, along the gap, up to the target. Correct, and in
  a swimlane diagram with lanes stacked vertically the "gap" it would travel through is
  another row's lanes. The line crosses exactly what it was supposed to avoid.
- *Break the connection and mark both ends* — the convention every printed flowchart uses,
  precisely because paper has this problem and no room to route around it.

The second is the answer, and it is also what makes FR-005 (unambiguous reading order)
fall out: the last step of a row carries "continues on row 2", the first of the next
carries "from row 1".

**Alternatives considered**:
- *Wrapping the whole diagram in a scroll container.* Solves nothing on paper.

## 5. What happens to a process too long even to wrap?

**Decision**: fall back to today's rendering — one row, shrunk to fit — and keep every step.

**Rationale**: FR-017. Wrapping buys a fixed amount of vertical room, because the report
gives the diagram a box of bounded height. Past that, the choice is between a shrunk map
and a clipped one, and the spec is explicit that completeness is never traded for
legibility.

Concretely: the box is between 320 and 640px tall, and a row costs `LANE_HEIGHT` per lane
it carries. A three-lane process therefore affords one row in the smallest box. The box has
to grow with the number of rows, up to a cap, and past the cap the fallback applies.

## 6. Does the interactive map share any of this?

**Decision**: no. The wrapping function is called only by the report's static diagram and
by the deck. The interactive map keeps reading stored positions directly.

**Rationale**: User Story 4 and FR-014/FR-015. The interactive map is where a consultant
arranges steps; wrapping it would fight them. The shared piece is the geometry module,
which is pure — the interactive map goes on not calling the new function in it.

This also settles FR-016: the wrap is computed in the renderer from the steps as they
stand, and there is nowhere for it to be stored even by accident.
