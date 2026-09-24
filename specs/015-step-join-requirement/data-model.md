# Data Model: Step Join Requirement

## Entities touched

### `ProcessStep` (existing — one new field)

| Field | Type | Notes |
|---|---|---|
| `joinRequiresAll` | `Boolean @default(false)` | New. "Either is enough" (default, unchanged behavior) vs "requires all" of this step's predecessors. Additive migration, no backfill — every existing step gets `false`, which is exactly what an unmarked convergence has always meant (FR-004, SC-002). |

No other field on `ProcessStep` changes. The rule is independent of `type`,
`label`, `positionX`/`Y`, `phaseId`, etc. — editing any of those leaves it
untouched (spec.md Edge Cases).

### `StepConnection` (existing — unchanged)

A step's predecessors are exactly its own `incomingEdges`
(`StepConnection[] @relation("ToStep")`, already on `ProcessStep`). No schema
change: the relation already supports many rows sharing one `toStepId`
(many-to-one), which is the entire structural basis of a join — nothing
today prevents two connections into the same step, the gap this feature
closes is purely in the UI (only one was ever shown) and in what the state
*means* (nothing distinguished either/all).

Adding a predecessor: `createStepConnection({ fromStepId: <chosen step>,
toStepId: <this step> })`. Removing one: `deleteStepConnection({
connectionId })`. Both actions already exist, unchanged (research.md
Decision 2).

## Migration

```sql
ALTER TABLE "process_steps" ADD COLUMN "joinRequiresAll" BOOLEAN NOT NULL DEFAULT false;
```

Additive, no data backfill, matches the `milestone` column's own shape
(`Boolean @default(false)`) already on this table.

## Domain types (new)

`lib/domain/predecessor-editor.ts` — pure, framework-free, mirrors
`lib/domain/decision-branches.ts`'s shape but for the incoming side (see
research.md Decision 4 for why it's a separate, smaller module):

```ts
export type ExistingPredecessorConnection = {
  id: string;
  fromStepId: string;
  label: string | null;
};

export type PredecessorDraft = {
  connectionId: string | null; // null = added client-side this session
  label: string;
  fromStepId: string; // "" = unset box, nothing to reconcile
};

export type PredecessorOperation =
  | { kind: "delete"; connectionId: string }
  | { kind: "create"; fromStepId: string; label: string };

export function reconcilePredecessorDrafts(
  existing: ExistingPredecessorConnection[],
  staged: PredecessorDraft[]
): PredecessorOperation[];
```

## Printed-map domain types (changed)

`lib/domain/print-map-layout.ts`:

- `PrintStepInput` gains `joinRequiresAll: boolean`.
- `FlowRow.mergesFrom` and `RolesCell.mergesFrom` change from `number[]` to
  `{ order: number; label: string }[]` (research.md Decision 5). Existing
  "either" wording keeps using `.order` only — output text for that case is
  unchanged; the new "requires all" wording uses `.label`.

## Server action changes

`lib/actions/process.ts`:

- `updateStepSchema` gains `joinRequiresAll: z.boolean().optional()`.
- `updateProcessStep` writes it to `prisma.processStep.update(...)` data
  exactly like the other optional fields already there
  (`...(parsed.data.joinRequiresAll !== undefined ? { joinRequiresAll: parsed.data.joinRequiresAll } : {})`),
  so a caller that doesn't send it (an old client, or a request built before
  this field existed) leaves the existing value untouched rather than
  silently resetting it to `false`.
- No new action. `createStepConnection` / `deleteStepConnection` are called
  unchanged, with `toStepId` set to the step being edited (research.md
  Decision 2).

## UI changes

- `step-list-row.tsx`: the existing single "Connects from" / "Connector
  label" fields are replaced by a new `PredecessorEditor`, seeded from *all*
  of the step's `incomingConnection`s (plural now, not one) — same
  replace-with-a-generic-N-box-editor shape `DecisionBranchEditor` used for
  the outgoing side, but simpler (no "create a new step" destination). A
  checkbox for `joinRequiresAll` sits with it, enabled regardless of how many
  predecessor boxes are currently staged (Edge Cases: the rule can be set
  ahead of a second predecessor existing). The closed row's summary line
  ("Connects from: X" / "Entry point — no predecessor") is extended to name
  every predecessor, and to read as "Needs both/all of: …" when the rule is
  on.
- `map-view.tsx`: `incomingConnectionOf` (singular, one per step) becomes
  `incomingConnectionsOf` (a `Map<string, ConnectionT[]>`), computed the same
  way `outgoingConnectionsOf` already is.
- `step-form.tsx` (new-step creation): unchanged. A step being created still
  starts from the single "Connects from" choice it already offers; a second
  predecessor is added afterward from the row's own editor, exactly the
  scope FR-001's own wording describes ("a step's editor").
- `flow-layout.tsx` / `roles-layout.tsx`: the `joins step X and step Y` line
  becomes conditional on `row.step.joinRequiresAll` /
  `cell.step.joinRequiresAll` — unchanged wording (still by order number)
  when `false`, new by-name wording when `true`.
