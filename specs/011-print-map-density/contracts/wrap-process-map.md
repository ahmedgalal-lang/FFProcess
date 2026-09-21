# Contract: `wrapProcessMap(steps, options)` — the `bands` option

The one interface this feature adds a parameter to. `lib/domain/process-layout.ts`.

## Behaviour callers may rely on

- Omitting `bands`, or passing `bands: true`, reproduces today's output exactly — same
  `WrappedRow.height`, same `PlacedStep.y`, same `lanes` array. This is what keeps the
  PPTX export and every existing test that doesn't pass the option unaffected.
- `bands: false` changes only `WrappedRow.height` and `PlacedStep.{y,laneIndex}` as in
  `data-model.md`'s table. `lanes` is still populated (Decision 3) — a caller that wants
  to skip drawing lane rectangles checks its own render branch, not the array's
  presence/absence.
- Row `capacity`, `column`, `direction`, `continuesOnto`/`continuesFrom`, and the overall
  `WrappedMapLayout.width`/`wrapped`/`height` are identical between the two modes for the
  same steps and box width — only how tall a row is and where within it a step sits
  change.
- The serpentine seam (`isSeamConnection`, `crossRowMarkers`) reads `PlacedStep.column`
  and `WrappedRow.direction`, neither of which this option touches, so seam behaviour is
  identical in both modes without any change to that code.

## What the caller (the static report diagram) must do

- Pass `bands: false` when building the print layout.
- Stop mapping `row.lanes` into drawn `lane` nodes when `bands` is false — the one
  render branch this feature adds an `if` to.
- Everything else (row label, rule, seam, markers, step cards, connector routing) is
  unchanged code, reading geometry that is already correct for the new mode because
  `wrapProcessMap` itself produced it that way.
