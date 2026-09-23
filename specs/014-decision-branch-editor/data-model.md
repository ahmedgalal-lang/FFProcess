# Phase 1 Data Model: Decision Branch Editor

No schema changes. A branch is not a new concept — it is a `StepConnection` whose
`fromStepId` is a `DECISION`-type step, viewed and edited through a purpose-built UI instead
of the generic single-connector field. Documented here for traceability between the spec's
requirements and the underlying fields.

## Entities read and written (existing, unchanged)

### ProcessStep
- `type` (`START`/`TASK`/`DECISION`/`END`) — the field the branch editor gates on (FR-001,
  FR-002). No new value is added to the enum.
- `id`, `label` — a branch box's "create a new step" path creates one of these via
  `addProcessStep`, exactly as adding any other step does.

### StepConnection
- `fromStepId`, `toStepId`, `label` (optional) — a branch *is* one row of this table.
  "Yes"/"No" are not stored as anything other than the plain string a consultant could
  already put in the connector-label field today (FR-004); nothing distinguishes a
  Decision's branch connections from any other step's connections at the data level, which
  is exactly why FR-009 and FR-014 — an existing connection with any label, from before this
  feature, must display correctly — need no migration to hold.
- A Decision step's branches, as a set, are simply
  `connections.filter(c => c.fromStepId === decisionStep.id)` — read once per process
  already (`map-view.tsx` loads every connection for the interactive canvas), not a new
  query.

## Derived (new, view-only) shape

Computed at render time in the Steps List, the same way `incomingConnectionOf` is today
(`map-view.tsx`) — not persisted, not a new table:

```text
outgoingConnectionsOf: Map<stepId, StepConnection[]>
  — built once from the process's existing `connections` array, keyed by fromStepId.
  Read by a DECISION row to populate its branch editor with what's already there (FR-009).
```

## Staged branch state (client-only, not persisted until Save)

Held in the add-step and edit-row forms' local state while the branch editor is open —
the same role `fromStepId`/`connectionLabel` already play for a step's one incoming
connection:

```text
BranchDraft = {
  connectionId: string | null     // an existing connection being edited, or null for a new one
  label: string                    // defaults to "Yes" / "No" for the first two boxes (FR-004)
  destination:
    | { kind: "existing"; stepId: string }        // FR-005, FR-006
    | { kind: "new"; label: string }               // FR-005
    | { kind: "unset" }                            // an empty box (FR-008)
}
```

On Save, each `BranchDraft` reconciles against `outgoingConnectionsOf` per Decision 4
(research.md) using the existing `createStepConnection` / `deleteStepConnection` /
`addProcessStep` actions — no new persisted shape results from this reconciliation beyond
the `StepConnection` rows those actions already write.
