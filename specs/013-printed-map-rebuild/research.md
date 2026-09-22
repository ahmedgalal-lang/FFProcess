# Research: Printed Process Map, Rebuilt

Phase 0 for [spec.md](./spec.md). Every decision below is answering "what does the spec
demand, and what is the smallest thing that delivers it" — not "what would be interesting to
build".

---

## Decision 1 — Stop drawing the printed map with ReactFlow

**Decision**: the report renders the map as ordinary server-rendered HTML and CSS. ReactFlow
is removed from the printed path entirely. It stays exactly where it is on the interactive
canvas.

**Rationale**: ReactFlow is a viewport abstraction — an infinite canvas you pan and zoom,
with absolutely-positioned fixed-size nodes and a transform on top. Every measured defect in
the spec is that abstraction meeting a fixed sheet of paper:

| Measured defect | What in ReactFlow causes it |
|---|---|
| 18 of 18 labels overflow their card | Nodes are absolutely positioned at a fixed size, so a label cannot make its own card taller — it overflows instead |
| 1 card clipped | The diagram is drawn into a fixed-height `overflow:hidden` box, because a canvas has no intrinsic height |
| Type at ≈5 pt | The only way to make a wide drawing fit a narrow page is a scale transform, which shrinks the text with it |
| Page breaks need pre-computed row groups | A transformed canvas cannot break across pages, so the renderer has to guess where a page ends and emit one box per group |
| Rows reverse direction | A consequence of wrapping, which only exists because the drawing is wider than the page |

Plain HTML gives all of it back for free: text wraps, boxes grow to fit their content,
`break-inside: avoid` puts page breaks between whole steps, and type is set in `rem` like the
rest of the report — so the report's existing Spacing control works on the map for the first
time.

**Alternatives considered**:
- *Keep ReactFlow, set larger node sizes.* Tried in spirit already — spec 011 widened the
  print cards and dropped lane bands. It moved the numbers without changing the shape: cards
  are still fixed-size, so a longer label still overflows. This is the patch the consultant
  asked us to stop applying.
- *Render to SVG and scale to fit.* Same failure as the zoom transform: fitting a wide
  drawing to a narrow page shrinks the text. SVG also has no text wrapping, so every label
  would need line-breaking computed by hand.

**Consequence**: `StaticProcessMapDiagram` is imported by exactly one file
(`app/reports/[workspaceId]/export-preview.tsx`), so it can be replaced wholesale. The live
canvas (`process-map-canvas.tsx`) and the PPTX deck (`lib/export/pptx/report-pptx.ts`) are
untouched, and both keep `wrapProcessMap` and `routeConnectors` — neither module is deleted.

---

## Decision 2 — Both layouts render with no client JavaScript

**Decision**: Flow and Roles are both server components emitting static HTML. Connectors are
grid-placed elements drawn with CSS borders, not SVG paths computed from measured positions.

**Rationale**: the deliverable is a PDF. A layout that depends on a client-side measurement
pass is a layout that can be captured mid-pass — and the report is already exported by
driving the page to PDF, where "did the JS finish" is a real failure mode we would have to
defend against forever. It also means the map inherits the report's own pagination and print
CSS rather than fighting it.

Both layouts turn out not to need measurement. In Flow every connection is between vertically
adjacent rows, so the rail is a border on a known element. In Roles every step knows its own
column and the next step's column, so the connector below a card is an element placed in the
grid spanning exactly those columns — CSS grid already knows where they are.

**Alternatives considered**:
- *SVG overlay with positions measured in a `ResizeObserver`* (what the mockup does, because
  a mockup only has to look right once). Rejected for the product: it reintroduces a layout
  pass the PDF has to wait for, and it cannot survive a page break, because the overlay is
  one element and the break is inside it.

**Consequence**: a connection whose two ends are *not* adjacent — the fixture's step 16 back
to 15 — cannot be an elbow. Those are drawn as a labelled back-reference on the card
(Decision 5).

---

## Decision 3 — Flow's geometry

**Decision**: one step per row, laid out as `rail | card` where the rail is a fixed narrow
column carrying the spine and any elbow, and the card takes the remaining page width.
Branch steps indent by one level. Indentation is capped at two levels.

Ordering rule, so the drawing is deterministic: of a decision's outgoing connections, the one
reaching the **next step in process order** continues the spine; every other one spurs. This
matters because a decision's connections have no inherent order — without a rule the same
process could draw two different ways.

Nesting cap: a branch inside a branch indents to level 2; anything deeper is drawn at level 2
with a back-reference naming its parent. Real consulting processes rarely nest past two, and
an uncapped indent eventually eats the page width that Decision 1 exists to protect.

**Rationale**: the page's long side goes to the label. At the report's 269 mm content width a
card gets ~230 mm, which holds the fixture's worst label — "Internal resources evaluation and
needs (e.g.; Hr, staffing, salaries, etc..)", 76 characters — on one line at 9.3 pt with room
to spare. That is the whole reason this layout satisfies FR-002 without a truncation rule.

**Alternatives considered**:
- *Two columns of steps per page.* Doubles the steps per page but halves the label width and
  reintroduces "which column do I read next". Rejected — it trades the thing being fixed for
  page count, which the spec explicitly declines to optimise for.

**Worth noting for later**: the ordering rule above exists only because a decision's outgoing
connections carry no recorded sense of which is the "main" path and which is the exception —
the map has to infer it from step order. If the step editor ever captured a decision's
outcomes explicitly at the point they are authored, this layout could read that instead of
inferring it, and the rule would become a fallback for older data rather than the mechanism.
That is a separate feature, not a dependency: this plan works with the data as it is today.

---

## Decision 4 — Roles' geometry, and the role ceiling

**Decision**: a CSS grid with one column per role **the process actually uses** (not every
role in the workspace), rows in step order, each step placed in its own row in its role's
column. The ceiling is **5 roles**; past it the map falls back to Flow and says so in place.

**Rationale for 5**: a card needs roughly 52 mm to set 8 pt text at about three words a line
without breaking words mid-word. At 269 mm of content width, minus the gaps between columns,
five columns is the last count that clears that. Four (the tender process) is comfortable;
six (the design-and-build process) is already past it — which matches what the mockup shows.

**Rationale for falling back rather than shrinking**: FR-023 requires predictable behaviour
past the ceiling and requires telling the consultant. Silently rendering 12 unreadable
columns is the current bug in a new costume.

**Alternatives considered**:
- *Split the roles across two column groups, continuing on the next page.* Breaks the
  one-row-per-step read that makes the layout worth having, and gives a reader two places to
  look for one step.
- *Rotate to landscape-of-landscape / scale down.* Shrinking type is Decision 1's whole
  objection.

---

## Decision 5 — What replaces the marker pairs

**Decision**: nothing, for most connections. A back-reference chip, for the rest.

In Flow, consecutive steps are vertically adjacent, so a page break between them needs no
annotation at all — the reader turns the page and continues down. That removes the
"continues on row n" / "from row n" pairs entirely for the common case, which is what the
spec's US3 is really asking for.

What remains is a connection between two steps that are **not** adjacent — a rejection loop,
or the fixture's step 16 rejoining at 15. Those are drawn as a chip on the source card
naming its destination and carrying **its own** connection label: `↩ Locally → step 15`. The
current bug (FR-009) is that a marker finds its label with a search that matches *any*
labelled connection touching that step; the replacement carries the label on the connection
object itself, so it cannot pick up a neighbour's.

**Alternatives considered**:
- *Draw every long-range connection as a routed line down the side of the page.* This is what
  `routeConnectors` does on the canvas, and on a page it produces exactly the sweeps across
  unrelated cards that FR-011 forbids.

---

## Decision 6 — Where the layout choice is stored

**Decision**: a new `reportMapLayout` enum column on `Workspace`, defaulting to `FLOW`.

**Rationale**: the obvious alternative is to put it inside the existing `reportArrangement`
JSON, which is already per-workspace. Rejected: that blob is a *versioned arrangement of
sections and blocks*, validated against a catalogue, with its own `ARRANGEMENT_VERSION` and
resolver. The map layout is not an arrangement of anything, and coupling them would mean a
consultant cannot choose a layout without also having arranged the pack, and that every
layout change bumps a version that governs unrelated data.

A column is also what makes FR-021 free: an unset workspace reads the enum default, so there
is no "never chosen" state to handle.

**Alternatives considered**:
- *Session state, like the Spacing control.* Rejected by FR-020 — the consultant asked for
  the choice to stick, and a pack that changes shape between quarters is the thing to avoid.
- *Per process.* Rejected in the spec: a pack is one document, and a map that changed layout
  between two processes inside it would read as a mistake.

---

## Decision 7 — How this gets tested

**Decision**: the "before" measurement harness becomes the acceptance test, parameterised
over both layouts; the pure layout logic gets unit tests first, per Constitution III.

The spec's success criteria are all measurements of rendered output — labels overflowing,
elements clipped, direction reversals, stubs into empty space. Those were measured on the
current build by rendering the fixture and reading the DOM. The same measurement becomes
`tests/e2e/printed-map.spec.ts`, run once per layout, asserting zero where today it counts
18, 1, 2 and 1.

What is *domain logic* rather than rendering — classifying which steps are branches, which
connection continues the spine, whether a process is over the role ceiling — goes in a pure
module under `lib/domain/` with tests written first and mutation-checked, because it decides
what the drawing claims about the process.

**Consequence**: the fixture built for the "before" numbers
(`tests/fixtures/tender-process.ts`) is load-bearing and stays.

---

## Resolved unknowns

| Unknown from Technical Context | Resolution |
|---|---|
| Does the live canvas change? | No. `process-map-canvas.tsx` and `routeConnectors` untouched. |
| Does the PPTX deck change? | No. It keeps calling `wrapProcessMap`, which stays. Revisited only if the deck is reported next. |
| Is `wrapProcessMap` deleted? | No — the deck still uses it. The report stops calling it. |
| How do page breaks work? | The report already prints through CSS paged media (`print-page`, `print-keep`); the map joins that instead of pre-computing row groups. |
| Does the Spacing control apply? | Yes, for the first time — the new map is set in `rem` like the rest of the report. |
