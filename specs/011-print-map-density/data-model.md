# Phase 1 Data Model: Printed Map Without Lane Bands

No database schema change. This is a change to the shape of in-memory layout geometry
that `wrapProcessMap` returns, and to which parts of it the print renderer draws.

## Changed: `wrapProcessMap` options

```ts
export function wrapProcessMap(
  steps: WrapStep[],
  options: {
    boxWidth: number;
    laneLabel: (roleId: string | null) => string;
    stepSpacing?: number;
    laneHeight?: number;
    /**
     * When false, a row is drawn as a single band sized to its tallest card
     * rather than one band per role its steps use. Defaults to true, so every
     * existing caller (the PPTX slide deck) is unaffected until it opts in.
     */
    bands?: boolean;
  }
): WrappedMapLayout
```

## Changed: `WrappedRow` and `PlacedStep`, by mode

| Field | `bands: true` (today, and PPTX) | `bands: false` (report) |
|---|---|---|
| `WrappedRow.height` | `lanes.length * laneHeight` | tallest card in the row + `WRAPPED_ROW_GAP` headroom |
| `WrappedRow.lanes` | one entry per distinct role the row's steps use | same — unchanged; the report renderer simply stops drawing it |
| `PlacedStep.laneIndex` | index into `lanes` | `0` for every step (single band) |
| `PlacedStep.y` | `row.y + laneIndex * laneHeight + laneHeight / 2` | `row.y + row.height / 2` (every step centred on the one band) |

Everything else — `column`, the serpentine `direction`, `continuesOnto`/`continuesFrom`,
row `capacity`, and the overall `WrappedMapLayout.width`/`height` — is unaffected: none
of it is a function of lane count.

## Changed: what the report renderer draws, by mode

| Drawn today | `bands: false` |
|---|---|
| One `lane` node (rectangle + role name) per `row.lanes` entry | Not drawn |
| Row label, backward-row notice | Unchanged |
| Row rule between rows | Unchanged |
| Seam between two rows sharing a canvas | Unchanged |
| Continuation markers for a row-crossing connection | Unchanged |
| Step card (role name printed on the card itself) | Unchanged |

## Unaffected

- `lib/export/pptx/report-pptx.ts` — does not pass `bands`, so it gets `true`, so its
  output is identical to today (SC-004's counterpart for the deck, though not itself an
  acceptance criterion here).
- `assignSwimlanes`/`laneY` and everything the interactive canvas calls — `wrapProcessMap`
  is not in that call graph at all (FR-006, SC-004).
- `lib/domain/connector-routing.ts` — takes drawn positions and sizes as input regardless
  of how they were produced; no signature or behaviour change.
