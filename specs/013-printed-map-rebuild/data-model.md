# Data Model: Printed Process Map, Rebuilt

Phase 1 for [spec.md](./spec.md). Almost nothing persists — this feature is a renderer. The
one stored value is which layout a client's pack uses.

---

## Stored

### `Workspace.reportMapLayout`

```prisma
enum ReportMapLayout {
  FLOW   /// The process runs down the page, one step per row.
  ROLES  /// A column per role, the process flowing down through them.
}

model Workspace {
  // ...
  /// Which layout this client's printed process map uses (FR-020). A column of
  /// its own rather than a field inside reportArrangement: that blob is a
  /// versioned arrangement of sections and blocks with its own catalogue and
  /// resolver, and the map layout is not an arrangement of anything. The
  /// default is what makes FR-021 free — an unset client has no "never chosen"
  /// state to handle, it simply reads FLOW.
  reportMapLayout ReportMapLayout @default(FLOW)
}
```

Additive and defaulted, so the migration needs no backfill and every existing client keeps
printing — in the new Flow layout, which is the point.

**Access**: written through a server action gated at `EDITOR`, like every other change to a
client's report (FR-022). Read by the report's server component.

---

## Derived, not stored

Everything else the layouts need is computed per render from the process that already exists.
These are the shapes the pure layout module produces and the renderers consume.

### `PrintStep`

One step as the printed map needs it — the renderer never touches Prisma rows directly.

| Field | Meaning |
|---|---|
| `id` | the step's id |
| `order` | 1-based position in the process, as printed on the card |
| `label` | the step's full label, never truncated by the layout (FR-002) |
| `roleName` | the responsible role, or `null` — rendered as "no role set" (FR-003) |
| `kind` | `start` · `task` · `decision` · `end` |
| `links` | cross-process links the card already shows today, carried through unchanged |

### `FlowOutline`

What the Flow layout is handed: the steps in printed order, each carrying its rail shape.

| Field | Meaning |
|---|---|
| `rows` | `FlowRow[]`, in the order they print |
| `backReferences` | connections that could not be drawn as a rail, by source step |

`FlowRow`:

| Field | Meaning |
|---|---|
| `step` | the `PrintStep` |
| `indent` | `0`, `1` or `2` — capped per research Decision 3 |
| `rail` | `first` · `spine` · `branch` · `merge` · `last` — which rail piece to draw |
| `branchLabel` | the label of the connection that reaches this step, when it is a spur (`"Yes"`, `"Internationally"`) — always that connection's own label (FR-009) |
| `endsHere` | true when no connection leaves this step — a terminated branch |

### `RolesGrid`

What the Roles layout is handed.

| Field | Meaning |
|---|---|
| `columns` | the roles the process actually uses, in first-appearance order |
| `cells` | `{ step, column, row }` — one per step, row in process order |
| `connectors` | `{ fromRow, fromColumn, toRow, toColumn, label }` for each drawable link |
| `backReferences` | as above, for links no connector can span |

### `LayoutOutcome`

What the report gets back when it asks for a layout, so the fallback is data rather than a
thrown error (FR-023):

```
{ layout: "FLOW",  flow: FlowOutline }
{ layout: "ROLES", roles: RolesGrid }
{ layout: "FLOW",  flow: FlowOutline, fellBackFrom: "ROLES", reason: "7 roles, ceiling is 5" }
```

The third case is what the consultant sees explained on the page — the map still prints, and
it says why it is not the layout they chose.

---

## Validation rules

| Rule | Where | Why |
|---|---|---|
| Exactly one row per step, in `order` | layout module | FR-001 — every step once |
| A branch's label is read from its own connection, never searched for | layout module | FR-009 — the current bug |
| Of a decision's outgoing connections, the one reaching the next step in order continues the spine | layout module | research Decision 3 — makes the drawing deterministic |
| `indent` never exceeds 2 | layout module | protects the label width Decision 1 exists for |
| A process using more than 5 roles cannot render as `ROLES` | layout module | FR-023, research Decision 4 |
| A step with no outgoing connection is `endsHere`, not an error | layout module | the fixture's rejection branch |
| Zero steps renders an empty state, not a frame | renderer | FR-016 |

---

## What is deliberately not modelled

- **No stored layout geometry.** Row heights, column widths and rail shapes are CSS. Storing
  them would be a second source of truth for what the page already decides.
- **No change to `ProcessStep` or `StepConnection`.** The rebuild reads what is there. In
  particular `positionX`/`positionY` are read by neither layout and written by neither
  (FR-015).
- **No per-process override.** One value per client, per the spec's assumption.
