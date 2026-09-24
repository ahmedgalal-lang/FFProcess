# Data Model: Parallel Step Numbering

## Entities touched

No schema change. `ProcessStep.order` (integer position) and
`ProcessStep.joinRequiresAll` (spec 015) are read, never written by this
feature. `StepConnection` is read only, for reachability.

## New domain module

`lib/domain/parallel-step-numbering.ts` (pure, framework-free —
Constitution Principle III):

```ts
export type NumberingStepInput = { id: string; order: number };
export type NumberingConnectionInput = { fromStepId: string; toStepId: string };

/**
 * order → "1", "2", … normally; a contiguous, mutually-unreachable group of
 * two or more direct predecessors of a joinRequiresAll step → "4a", "4b", …
 * sharing the base their first member would have held, with every step
 * after them continuing as if the group used one slot (research.md
 * Decisions 1-3).
 */
export function computeStepNumberLabels(
  steps: NumberingStepInput[],
  connections: NumberingConnectionInput[],
  joinRequiresAllIds: Set<string>
): Map<string, string>;
```

Internal shape (not exported, implementation detail for tasks.md to build
against):
1. `reachable(a, b, adjacency)` — directed BFS/DFS from `a`, cycle-safe via a
   visited set, returns whether `b` is reachable.
2. For each `joinRequiresAll` step `j`, direct predecessors `S = { p :
   connection p→j exists }`. Exclude any `p ∈ S` with `reachable(p, q)` or
   `reachable(q, p)` for some other `q ∈ S`. Remaining `S'` is a candidate
   group when `|S'| ≥ 2`.
3. A candidate group is realized only when contiguous in `steps` order
   (research.md Decision 2) — i.e. every step whose `order` falls between
   the group's min and max member `order` is itself a member.
4. Walk `steps` in order once, assigning: a plain step gets the next integer
   as a string; a realized group's first-encountered member takes that
   integer as its base and letter `a`, later members of the same group take
   `b`, `c`, … at the *same* base; the integer counter advances by exactly
   one once a group is fully consumed, not once per member.

## Printed-map domain types (changed)

`lib/domain/print-map-layout.ts`:

- `PrintStepInput` gains `numberLabel: string`.
- `FlowRow.mergesFrom` / `RolesCell.mergesFrom` entries gain `numberLabel: string`
  (kept alongside the existing `order` and `label` fields — see research.md
  Decision 5).
- `BackReference` gains `toNumberLabel: string` and `fromNumberLabel: string`
  (kept alongside the existing `toOrder`/`fromOrder`, which remain the
  lookup keys `flow-layout.tsx` already indexes by).

## Renderer changes

- `flow-layout.tsx` / `roles-layout.tsx`: card-number `<span>` prints
  `numberLabel` instead of `order`; `mergeWording`'s unmarked branch prints
  `step ${m.numberLabel}` instead of `step ${m.order}`; back-reference text
  prints `toNumberLabel` instead of `toOrder`.
- `printed-process-map.tsx`: computes the label map once via
  `computeStepNumberLabels`, adds `numberLabel: labelMap.get(step.id)!` to
  each `layoutSteps` entry alongside the existing `joinRequiresAll`.

## Steps List changes

- `map-view.tsx`: computes the label map once, passes each row a
  `numberLabel: string` prop instead of relying on `index + 1`.
- `step-list-row.tsx`: the number chip renders `numberLabel` instead of
  `index + 1`. `index` itself is unchanged — still drives `isFirst`/`isLast`
  for the move buttons.
