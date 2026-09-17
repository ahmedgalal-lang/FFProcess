# Data Model: Wrapped Process Map

## No schema change

Nothing is stored. The wrap is computed when the report renders, from the steps as they
stand, which is what makes FR-014 and FR-016 true by construction rather than by care:
there is no column for a wrapped position to be written to.

`ProcessStep.positionX` / `positionY` are **read** to decide order and lane, and never
written by this feature.

## Read model: `WrappedMapLayout`

Produced by one pure function in `lib/domain/process-layout.ts`.

```
wrapProcessMap(steps, { boxWidth }) => WrappedMapLayout

WrappedMapLayout {
  wrapped: boolean      // false when everything fits one row — today's rendering
  rows: WrappedRow[]
  width: number         // the widest row
  height: number        // all rows stacked
  capacity: number      // steps per row, for tests and for the caller's box sizing
}

WrappedRow {
  index: number             // 0-based; "row 1" to a reader
  lanes: WrappedLane[]      // only the lanes this row actually needs
  steps: PlacedStep[]
  y: number                 // this row's top, in the same units as everything else
  height: number            // lanes.length * LANE_HEIGHT
  /** The row this row's last step continues onto, or null on the final row. */
  continuesOnto: number | null
  /** The row this row's first step continues from, or null on the first row. */
  continuesFrom: number | null
}

WrappedLane {
  roleId: string | null     // null is the Unassigned lane
  label: string
  y: number                 // relative to the row
}

PlacedStep {
  id: string
  x: number                 // absolute, within the layout
  y: number                 // absolute, within the layout
  row: number
  laneIndex: number         // within that row's lanes
}
```

### How a step is placed

1. **Order**: steps sorted by stored `positionX`, then `positionY`. The order the
   interactive map and the Steps List already show — this feature re-flows it, it does not
   re-derive it.
2. **Row**: `floor(orderIndex / capacity)`, where capacity is `max(2, floor(boxWidth /
   STEP_X_SPACING))`.
3. **Column within the row**: `orderIndex % capacity`, placed at
   `FIRST_STEP_X + column * STEP_X_SPACING`.
4. **Lane**: the role's position among *that row's* lanes, so a row carries no lane it does
   not use (FR-009). Lane order within a row follows the whole-process order from
   `assignSwimlanes`, so a role sits in the same relative place on every row it appears on.

### When nothing wraps

`capacity >= steps.length` returns `wrapped: false` and a single row whose placement is
the existing one. The caller renders exactly what it renders today — FR-003 and SC-005 are
satisfied by the caller taking the same path, not by two layouts that happen to agree.

## Read model: `CrossRowMarker`

What replaces a line that would otherwise run across the page.

```
CrossRowMarker {
  stepId: string
  kind: "continues" | "from"
  otherRow: number      // 1-based, as a reader counts
}
```

A connection whose two steps land on different rows contributes one marker at each end.
Same-row connections are drawn as edges exactly as now.

This is the printed-flowchart convention rather than a routed line, and for a reason
particular to this diagram: the space a routed line would travel through is another row's
swimlanes, so routing around the steps means crossing the lanes instead.

## What does not change

- Stored step positions, and therefore the interactive Process Map.
- Lane assignment itself — `assignSwimlanes` is reused, not replaced.
- A step's drawn size (`NODE_HALF_SIZE`), which is shared with the interactive map and the
  deck and is the definition of "readable" this feature wraps to preserve.
