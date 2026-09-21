# Phase 0 Research: Printed Map Without Lane Bands

## Decision 1 — Where the change lives

**Decision**: `wrapProcessMap` in `lib/domain/process-layout.ts` gains one new option,
`bands?: boolean` (default `true`, preserving today's behaviour everywhere it is called
without the flag). The static report diagram passes `bands: false`. Nothing else changes
its call.

**Rationale**: `wrapProcessMap` already has exactly two callers —
`static-process-map-diagram.tsx` (the report) and `lib/export/pptx/report-pptx.ts` (the
slide deck) — confirmed by grep before writing this plan, not assumed. The interactive
canvas does not call it at all; it lays out swimlanes through a separate, unwrapped path
(`assignSwimlanes`/`laneY`), so FR-006 ("the live canvas is untouched") is true by
construction the moment this function is left alone for every caller but one. A default
that keeps today's behaviour is what makes the PPTX caller's silence in the user's
request safe: it is unaffected unless it explicitly opts in.

**Alternatives considered**:
- *A second function, `wrapProcessMapFlat`.* Rejected: it would duplicate the row-
  packing, serpentine direction, and seam-column logic — the part that is genuinely
  shared — for the sake of the one part (band height) that differs. A flag is a smaller
  surface and the same precedent `wrapProcessMap`'s own `laneHeight`/`stepSpacing`
  options already set.
- *A prop on the React component instead of the domain function.* Rejected: the choice
  of whether a row needs a lane grid changes the geometry the connector router consumes
  (`RoutedStep.y`), not just how the row is drawn — it belongs in the same pure function
  that already computes that geometry, per the project's standing rule that presentation
  math is domain logic, not component logic.

## Decision 2 — What a bandless row's height and step placement are

**Decision**: With `bands: false`, a row's height is `tallest card in the row + a fixed
headroom for the connectors that leave it`, and every step in the row is centred on that
one band rather than placed by a per-role lane index.

**Rationale**: This is FR-001 and FR-005 stated as arithmetic. The connector router
already turns a routed connector's vertical run through the gap between rows — it does
not care whether that gap used to hold four lane bands or none, only that the band it is
given is tall enough for the lines it needs to carry (`connector-routing.ts`'s own
`OUTER_BAND_DEPTH`/clearance logic handles a shallow band by shrinking its own spacing,
proven in the routing feature's mutation tests). Centring every card on the same y also
answers the edge case in the spec about a decision and a task sharing a row: both sit on
the row's own centre line, so their *tops* differ by their height difference rather than
their *baselines* looking arbitrary.

**Headroom figure**: `WRAPPED_ROW_GAP` (46px) is already spent between rows for exactly
this — the connector router's band-clearance logic — so the same constant is reused
rather than inventing a second one. No new constant.

## Decision 3 — What happens to `WrappedRow.lanes`

**Decision**: `lanes` is still returned as today — the distinct roles a row's steps use,
in whole-process order — because it costs nothing to compute and the router or a future
caller may still want to know what a row touches. What changes is that
`static-process-map-diagram.tsx` stops turning it into drawn rectangles and name labels
when `bands: false`.

**Rationale**: Keeps the domain function's return shape stable across both modes, so the
one call site that reads `row.lanes` (confirmed by grep: exactly one, the lane-node
builder) is the only place that needs an `if`, rather than every consumer of
`WrappedRow` needing to handle an optional field. Matches Principle VI (smallest change
that solves the reported problem) — a field nobody but one render branch reads is not
worth removing for one caller when the other caller (PPTX) still needs it exactly as it
is.

## Decision 4 — The role name on the card

**Decision**: No change. `CompactStepNode` (`map-nodes.tsx`) already renders
`shortRoleName(data.roleName)` beneath the step label on every printed card, confirmed by
reading the component, not assumed from the mockup.

**Rationale**: This is what makes FR-002 already true rather than a task to build. The
mockup's colour flag was an illustration for a hypothetical where the card carried no
role text at all; it does not apply here, and adding one would be scope the spec never
asked for (Principle VI again — don't add a compensating device for information that was
never actually lost).

## Decision 5 — What this feature does not touch

- **The gutter width (`WRAPPED_LANE_GUTTER`, 170px) and the row label's position inside
  it.** The row label ("Row N of M · Steps a–b") is drawn from this same x regardless of
  bands; removing per-row lane *name* labels does not remove the row label itself, so the
  gutter still earns its keep. Narrowing it is a legitimate follow-on (more width for
  cards) but is not required by any acceptance scenario in the spec and is left alone to
  keep this change to what was asked.
- **Row-group pagination (`rowGroups` in the static diagram).** Reads `row.height`
  generically and needs no change — it already packs whatever height each row reports,
  and a bandless row simply reports a smaller one, which is the entire mechanism by which
  SC-001 (fewer pages) is delivered.
- **The PPTX slide-deck export.** Confirmed calling `wrapProcessMap` without the new
  option, so it keeps today's per-role bands, per the spec's Assumptions.
- **Connector routing itself (`connector-routing.ts`).** Already geometry-only, driven
  entirely by drawn `RoutedStep` positions and sizes; a bandless row changes what
  positions it is handed, not the router's logic. FR-004/SC-002 are a proof obligation on
  the existing router, not new code.


## Measured baseline

Measured on `tests/fixtures/wide-process.ts` — the six-role, twenty-five-step fixture —
rendered to PDF and read by which physical pages carry which row label:

| | Before |
|---|---|
| Pages the map occupies | **4** (pages 5–8 of a 9-page report; row 5 of 5 shares page 8 with the start of the RACI section) |
| Rows | 5 (six-lane rows 1–4, one-step row 5) |
| Row-group boxes | 5, one per page break except the last, which shares its page |

Must be measurably lower after this feature (SC-001).
