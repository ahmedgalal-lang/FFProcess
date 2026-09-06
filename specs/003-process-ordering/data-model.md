# Phase 1 Data Model: Process Ordering

## Changed entity

### `Process` — one new field

| Field   | Type  | Default | Meaning |
|---------|-------|---------|---------|
| `order` | `Int` | `0`     | Position among this process's siblings — among the workspace's top-level processes when `parentProcessId` is null, otherwise among that parent's sub-processes. |

Mirrors `ProcessStep.order` and `Phase.order`, which already exist with the same shape,
default, and meaning-among-siblings semantics.

**Index**: the existing `@@index([workspaceId, parentProcessId])` already covers the read
pattern (all of a workspace's processes, grouped by parent), so ordering adds no new index.
`order` is a sort key applied after that filter, not a lookup key.

**No new entity.** A pack's own order is carried in the report link (research R2) and is never
persisted, so nothing models a "pack".

## Ordering rules

**Comparator** (the single definition of "in order", used everywhere processes are listed):

1. `order` ascending, then
2. `code` ascending as tie-break.

The tie-break is not decoration — it is what makes FR-005 hold for rows that share a position:
never arranged (all `0`), seeded outside the app, or written concurrently by two people. Two
loads of unchanged data must never differ.

**Grouping**: the ordered list is built by taking top-level processes in comparator order and
emitting each one's children, also in comparator order, immediately after it. A sub-process
whose parent is absent from the workspace list (an orphan, which the Processes page already
handles as a separate case today) is ordered among the top-level processes rather than
disappearing.

**Move**: swapping a process with its adjacent sibling in that group. A move at the start or
end of a sibling group is a no-op, not an error (FR-002 acceptance scenario 2).

**Creation**: a new process takes `max(order) + 1` within its level, so it lands at the end and
displaces nothing (FR-006).

**Deletion**: leaves the remaining positions untouched. Gaps in the integer sequence are
harmless — the comparator only cares about relative order — so no renumbering pass is needed
(FR-013).

## Validation rules

| Rule | Where enforced | Requirement |
|------|----------------|-------------|
| A submitted order must be a permutation of exactly that workspace's processes at that level — no additions, drops, or foreign ids | Reorder action, before writing | FR-012 |
| The requester must hold edit rights on the workspace | Reorder action, server-side | FR-012 |
| Every process named must belong to the requesting workspace | Reorder action, server-side | FR-012, Principle V |
| A pack's order may name only processes the requester can already read | Report loading (existing workspace scoping) | Principle V |
| A pack order naming an unknown, deleted, or partial set still renders | Report loading, applied as a sort not a filter | Edge cases |

The permutation check mirrors `reorderProcessSteps`, which already rejects a submitted order
that is not the same set as the process's current steps.

## Migration

Backfill, per workspace and per parent level, assigning `0..n-1` in current `code` ascending
order (research R4), so the first render after deploy matches the last render before it.
