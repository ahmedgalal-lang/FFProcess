# Phase 0 Research: Connector Routing on the Process Map

## Decision 1 — Where the routing decision lives

**Decision**: A new pure module `lib/domain/connector-routing.ts`, taking drawn step
geometry plus the list of connections and returning one route per connection. Neither
renderer decides anything; both consume the same answer.

**Rationale**: Constitution Principle II (shared domain model) and the precedent already
set by `process-layout.ts` and `milestone-rails.ts` — the wrapped map's geometry is
computed once and consumed by the canvas, the print diagram and the PPTX export. The
defect being fixed here is itself partly a consequence of *not* doing that: the live
canvas has `chooseHandles` and the static diagram has a near-copy `chooseHandlesAt`, and
they have already drifted once (the static one had to learn about wrapped positions
separately). A single function also makes SC-005 ("printed routes match screen routes")
true by construction rather than by inspection.

**Alternatives considered**:
- *Route inside a custom ReactFlow edge component.* Rejected: corridor assignment is a
  global decision — a connector's line depends on every other connector wanting the same
  band. A per-edge component cannot see its neighbours without recomputing the whole
  allocation once per edge.
- *Extend `chooseHandles` in place, twice.* Rejected: doubles the drift that caused the
  bug.

## Decision 2 — How a route reaches the screen

**Decision**: A custom ReactFlow edge type (`routed`) rendered with `<BaseEdge>`. The
parent computes all routes in a `useMemo` and puts each connector's route on its edge's
`data`; the edge component turns that into an SVG path string and hands it to `BaseEdge`.

**Rationale**: `@xyflow/react` 12.11.2's `BaseEdge` exists for exactly this: given a
`path`, it renders the visible stroke *and* the invisible wide interaction path that makes
an edge clickable, *and* the label with its background. That is FR-011 and FR-012 — label
legibility, selection and deletion — kept for free rather than reimplemented. The edge
component also receives `sourceX/sourceY/targetX/targetY` already resolved from the chosen
handles, so it never needs absolute node coordinates of its own.

Computing in the parent is also what makes FR-010 true: the live canvas already holds
`nodes` in state and ReactFlow updates it on every drag frame, so a `useMemo` keyed on
node positions re-routes as the card moves. A route frozen onto `data` at first render
would go stale — the trap this decision exists to avoid.

**Alternatives considered**:
- *`getSmoothStepPath` with offsets.* Rejected: it takes a source and a target and picks
  its own corner placement. The whole point of Option A is that we choose where the line
  turns; a helper that chooses for us cannot express "this connector's own line in this
  band".
- *Keep `type: "smoothstep"` and only change the handles.* Rejected: it was tried
  implicitly by the current code. Handles alone give four exit points per card, so the
  fifth connector leaving a card must share, which is the overlap in the screenshot.

## Decision 3 — What counts as "a row" and "a column"

**Decision**: Rows are derived by clustering the drawn steps' centre-y values (two steps
within a small tolerance are in the same row); a card's horizontal neighbours are the
nearest cards in its own row to left and right.

**Rationale**: The router must work from *drawn* positions (FR-001), and drawn positions
come from three different places: `laneY` on the live canvas, the serpentine wrap in the
print diagram, and a user's own drag. A lane index passed in from outside would be right
for two of those and wrong for the third. Clustering the y values that are actually there
is correct for all three and needs no caller to be trusted.

**Alternatives considered**:
- *Pass lane index and column index in from the caller.* Rejected: the live canvas lets a
  user drag a card anywhere, at which point its stored lane index is a lie. Deriving from
  position means a dragged card routes from where it is.
- *Derive columns by dividing x by `STEP_X_SPACING`.* Rejected for the same reason, and
  because it silently breaks if the spacing constant changes.

## Decision 4 — When a connector is drawn direct

**Decision**: Direct when the two steps are in the same row **and** the straight segment
between their facing edges passes no other card. Everything else is routed.

**Rationale**: The spec's rule ("one column apart in the same swimlane") is a proxy for
the thing that actually matters, which is whether anything is in the way. Testing the
real condition is no harder, keeps FR-002 and FR-007 from ever disagreeing, and stays
correct when a user drags a card out of the grid. On an untouched auto-laid-out map the
two rules select exactly the same connectors.

## Decision 5 — Guaranteeing a route never crosses a card

**Decision**: A routed path has exactly three segments that leave the immediate area of a
card: a vertical in a **channel**, a horizontal inside a **band**, and a vertical in
another channel. A band is the full-width strip between two rows. A channel is a
full-height vertical strip that is clear of every card on the map, not merely of the cards
in one row.

**Rationale**: This is the argument that makes SC-001 hold rather than a hope that it does.
A band is bounded by the deepest card bottom of the row above and the tallest card top of
the row below, measured across the whole row, so nothing is drawn in it at any x. A
channel is bounded by the nearest card edge on either side taken across *all* rows, so
nothing is drawn in it at any y. A path built from those two regions cannot enter a card.

**The correction that produced this wording**: the first version measured a gutter as the
space between a card and its neighbour *in the same row*. That is wrong, and wrong in a
way that only shows up on a map with three or more rows. A connector from row 0 to row 3
runs in the band below row 0 and then descends to row 3 — passing straight through rows 1
and 2. A gutter that is clear in row 3 says nothing about what is in rows 1 and 2 at that
x. Because the auto-layout puts every row's cards on the same column positions, a channel
that is clear everywhere exists between every pair of columns, so measuring globally costs
nothing and closes the hole. The per-row version would have reproduced the mockup's
surviving crossing on any map deep enough to show it.

A channel also has to step over a card that *overlaps* the edge it starts from: a decision
is 8px wider than a task, so the strip starting at a task's right edge begins inside the
decision sitting below it in the same column. The channel's near edge is therefore pushed
past any card whose horizontal span contains it, before its far edge is measured.

Both the corridor line within a band and the vertical within a channel are clamped to
their region rather than being fixed offsets. Fixed offsets are what the mockup used, and
are why a crossing survived in it.

## Decision 6 — More connectors than a band has room for

**Decision**: Lines within a band are distributed evenly across the band's usable height:
with *n* connectors and usable height *h*, the *i*-th sits at `h * (i+1) / (n+1)`, capped
so spacing never exceeds a comfortable default. Nothing ever spills into another band.

**Rationale**: It gives every connector a distinct line for any *n* (FR-006) and can never
place a line outside its band, so Decision 5's no-crossing argument survives any load. At
realistic sizes it is indistinguishable from fixed spacing: a ~100px band with four
connectors puts them 20px apart.

**Trade-off recorded**: with a very large *n* the lines get tight — twenty connectors in
one band would be 5px apart. They are still distinct and still inside the band, so no
requirement breaks, but the map would be dense. The alternative — spilling overflow into
the neighbouring band — was rejected under Principle VI (YAGNI): it needs a second
allocation pass, and a band with twenty connectors in it does not occur in any process in
the product today. If one ever does, the even-distribution code is where to add it, and
this paragraph is the record of the deferral.

## Measured baseline

Measured on `tests/fixtures/tangled-process.ts` — ten steps over three roles, thirteen
connectors including two long forward jumps, a loop back across five columns, and three
connectors arriving at one card — rendered on the live canvas and read out of the page by
`tests/e2e/connector-routing.spec.ts`:

| | Before |
|---|---|
| Connectors entering a card that is not one of their own endpoints | **3** |
| Pairs of connectors sharing a line for a readable distance | **15** |

Both must be 0 (SC-001, SC-002).

**How nearly this baseline was fake.** The first version of the measurement reported 0
crossings — on the unfixed map. `getPointAtLength` answers in the path's own user space,
which the canvas's pan-and-zoom transform has not been applied to, while the cards were
measured with `getBoundingClientRect` in viewport space. The two coordinate spaces never
met, so no path ever appeared to touch any card and the check passed on everything. It was
caught by asking the diagnostic which cards each connector enters and getting "(none)" for
all thirteen — including each connector's own endpoints, which is impossible. The fix is
`getScreenCTM`, and the lesson is that a measurement passing on the unfixed artifact is a
broken measurement, not good news.

## Decision 7 — What this feature does not touch

- **Continuation stubs on the wrapped print map.** A connector whose two steps land on
  different rows of the serpentine wrap is already replaced by a labelled stub at each
  end. Those are not connectors to route and are left exactly as they are.
- **The seam connector** between the end of one wrapped row and the start of the next
  keeps its dedicated bottom-to-top drawing.
- **Branch-entry edges** (the inherited hand-off into a sub-process's entry points) are
  drawn from a synthetic node, not a step, and keep their current treatment.
