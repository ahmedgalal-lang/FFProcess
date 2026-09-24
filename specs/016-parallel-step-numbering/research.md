# Research: Parallel Step Numbering

## Decision 1: A step's stored `order` stays a plain sequential integer; the lettered label is a separate, purely computed value

**Decision**: No schema change (spec's own Assumptions already rule this out). A
new pure function derives a `Map<stepId, string>` of *display labels*
("1", "2", "4a", "4b", "5", …) from the same inputs `print-map-layout.ts`
and the Steps List already have — steps in order, connections, and which
steps have `joinRequiresAll`. Every place inside `print-map-layout.ts` that
currently reasons about position (indent, spine selection, sort order,
`mergesFrom`'s numeric ordering) keeps using the raw integer `order`
unchanged; only the last mile — what a renderer prints — switches to the
computed label.

**Rationale**: FR-010 is explicit that stored position and reasoning about
position must be untouched. Keeping the split clean (integer for logic,
string label only at render time) is also what makes SC-002 (zero change for
a process that doesn't use this) trivially true: a process with no
qualifying group produces a label map that is just `String(order)` for every
step, byte-identical to what every renderer already prints today.

## Decision 2: A parallel group requires its members to be contiguous in Steps List order

**Decision**: Two or more steps that are structurally eligible (direct
predecessors of the same `joinRequiresAll` step, mutually unreachable —
spec FR-001/FR-002) are only assigned letters when nothing else in the
Steps List sits between the first and the last of them. If an eligible group
is *not* contiguous, every one of its members falls back to an ordinary
whole number.

**Rationale**: The spec's own Edge Cases and every acceptance scenario
describe a group as occupying consecutive positions ("4 and 5" → "4a" and
"4b"), and FR-005 promises the sequence continues "as if the group occupied
one position" — a promise that only has one unambiguous meaning when the
group *is* one contiguous span. A non-contiguous group has no single
well-defined "one slot" to collapse into without either re-deriving a second,
unstated policy for interleaved steps or silently renumbering steps the
group doesn't structurally include. In the workflow this models, two direct
predecessors of the same join are the two branches leading into it — a
consultant places them next to each other in the Steps List as a matter of
course (the same way spec 014's Yes/No branches sit next to their Decision).
A non-contiguous case is not in any acceptance scenario, so falling back to
plain numbers for it is a conservative default (never mislabels, never
invents a numbering rule nobody asked for), consistent with Constitution
Principle VI.

**Alternatives considered**: Collapsing the group's slot at the position of
its *first* member and shifting only the steps between its members —
rejected; it silently renumbers steps that are structurally unrelated to the
join (Edge Case 1 already draws a hard line: an excluded predecessor sits
"next to, not inside" a group — the same logic argues against absorbing
unrelated in-between steps into a group's "one slot" either).

## Decision 3: Group detection algorithm

**Decision**: For each step `j` with `joinRequiresAll = true`, let `S` be its
direct predecessors (steps with a connection whose `toStepId` is `j`). A
step `p ∈ S` is **excluded** from `j`'s group if there exists any other
`q ∈ S` such that `p` can reach `q`, or `q` can reach `p`, via any chain of
connections in their stored direction (a directed reachability check, cycle-
safe via a visited set — cycles are already permitted in this domain per
spec 013). The group is what remains of `S` after removing every excluded
step. A group of fewer than two members produces no lettering (its lone
member, if any, keeps an ordinary number).

**Rationale**: This is FR-001/FR-002 read literally — "no path to one
another" for the pair, applied pairwise across the whole candidate set, not
just adjacent pairs — and matches Edge Case 1's own description of a mixed
set (some pairs connected, some not) exactly: only the mutually-unreachable
remainder groups together.

## Decision 4: Where the domain function lives, and its shape

**Decision**: New module `lib/domain/parallel-step-numbering.ts`, pure and
framework-free like every other file in `lib/domain/` (Constitution
Principle III — this is a business rule, not presentation, so it's
unit-tested and mutation-checked before the two call sites use it):

```ts
export type NumberingStepInput = { id: string; order: number };
export type NumberingConnectionInput = { fromStepId: string; toStepId: string };

export function computeStepNumberLabels(
  steps: NumberingStepInput[],
  connections: NumberingConnectionInput[],
  joinRequiresAllIds: Set<string>
): Map<string, string>;
```

Both call sites already have everything this needs without a new query:
- **Steps List** (`map-view.tsx`): `steps` (now including `joinRequiresAll`,
  added in spec 015) and `connections`, already loaded for the page.
- **Printed report** (`printed-process-map.tsx`): same — `steps` (spec 015
  added `joinRequiresAll` to `PrintedMapStep`) and `connections`.

**Rationale**: One function, called twice, rather than duplicating group
detection in two renderers — the two call sites differ only in what they do
with the resulting label (a `<span>` on a Steps List row vs. text baked into
`PrintStepInput`/`FlowRow`/`RolesCell`/`BackReference`), not in how a label is
derived.

## Decision 5: Threading the label through `print-map-layout.ts`'s existing types

**Decision**:
- `PrintStepInput` gains `numberLabel: string` (computed once in
  `printed-process-map.tsx` before calling `buildPrintMapLayout`, the same
  way `joinRequiresAll` was added in spec 015).
- `FlowRow.mergesFrom` / `RolesCell.mergesFrom` gain a third field on each
  entry: `numberLabel: string`, alongside the existing `order` (kept, still
  used nowhere in rendering after this change, but kept for test/debug
  clarity and because removing it is unrelated churn) and `label` (the
  predecessor's own name, spec 015's by-name wording).
- `BackReference` gains `toNumberLabel: string` and `fromNumberLabel: string`
  alongside its existing `toOrder`/`fromOrder` (which stay, unchanged, since
  `backByStep` in `flow-layout.tsx` keys off `fromOrder` — a lookup key, not
  display text).
- The card-number `<span>` in both renderers (`row.step.order` /
  `cell.step.order`) switches to `row.step.numberLabel` /
  `cell.step.numberLabel`.
- `flow-layout.tsx`'s `mergeWording` helper (spec 015) switches its unmarked
  branch from `` `step ${m.order}` `` to `` `step ${m.numberLabel}` ``; its
  "requires all" branch is untouched (FR-007 — that wording already names
  steps, not numbers). `roles-layout.tsx` mirrors this identically (the two
  files already duplicate this helper, spec 015 research.md Decision 5).

**Rationale**: Every one of these fields is already resolved once, at the
same place `order`/`label` already are (`byId.get(...)!`, a full
`PrintStepInput`), so this is the same cost as the fields it sits beside —
no new lookup, no new pass over the data.

## Decision 6: Steps List wiring

**Decision**: `map-view.tsx` computes the label map once (via Decision 4's
function) and passes each row its own `numberLabel: string`, replacing the
`index + 1` currently shown in `step-list-row.tsx`'s number chip. `index`
itself is untouched and keeps its existing job — `isFirst`/`isLast` for the
move-up/move-down buttons, which are positional, never about the label.

**Rationale**: Matches FR-010 precisely: the only thing that changes is what
character(s) render inside the chip.
