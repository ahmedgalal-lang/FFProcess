# Research: Step Join Requirement

No open technical unknowns — this feature is deliberately shaped around three
mechanisms already shipped and proven in this codebase: the incoming half of
`StepConnection` (already many-to-one, no schema change needed for the
relationship itself), the printed map's existing `mergesFrom` computation
(spec 013), and the branch-editor reconciliation pattern (spec 014,
`lib/domain/decision-branches.ts`). Each decision below names the precedent it
follows and why this feature doesn't need to invent something new.

## Decision 1: The arrival rule is a field on `ProcessStep`, not a new entity

**Decision**: `ProcessStep.joinRequiresAll Boolean @default(false)`, additive
migration, no backfill.

**Rationale**: The rule is a fact about one step ("how do my own predecessors
combine"), never shared or referenced by anything else — an entity would add a
table and a join for a single boolean. `default(false)` on the migration
itself is what makes SC-002 ("zero processes change in appearance the first
time they're opened after this ships") true without any data migration step:
every existing row gets the value that already matches its current, unmarked
behavior.

**Alternatives considered**: A new `StepArrivalRule` join table — rejected,
nothing about the rule varies per-connection or needs its own history; it is
one fact about the step, same shape as the existing `milestone` boolean.

## Decision 2: Managing predecessors reuses `createStepConnection` / `deleteStepConnection` — no new action

**Decision**: Adding or removing a predecessor is exactly adding or removing a
`StepConnection`, the same two EDITOR-gated actions the Decision branch
editor (spec 014) already uses for the outgoing side
(`lib/actions/process.ts:921,959`). Both already accept an arbitrary
`fromStepId`/`toStepId` pair with no directional restriction, so nothing about
them needs to change to be called with the new step "on the incoming side"
instead of the outgoing one.

**Rationale**: Constitution Principle VI (Simplicity) — the exact capability
already exists and is already tested; a second, direction-specific pair of
actions would be pure duplication for zero new behavior.

**Alternatives considered**: A dedicated `addPredecessor`/`removePredecessor`
pair — rejected as a same-shaped duplicate of the existing actions.

## Decision 3: The rule is edited as part of the step's existing edit form, not a standalone one-click action

**Decision**: `joinRequiresAll` becomes an optional field on the existing
`updateStepSchema` / `updateProcessStep` action (`lib/actions/process.ts:749`),
saved together with the rest of the row's edit form (label, type, role,
detailed action, …) — not a separate server round-trip like
`setStepMilestone`.

**Rationale**: `setStepMilestone` is deliberately a one-click toggle reachable
from the closed row, independent of opening the editor at all — that fits a
judgement made while reading the list. The arrival rule is authored alongside
predecessor management itself, inside the open editor, the same way `type` or
`exceptionHandling` are — there's no case where a consultant sets this rule
without the editor already being open, so a separate action would only add a
second `startTransition` call for no independent benefit.

**Alternatives considered**: A `setStepJoinRequiresAll` action mirroring
`setStepMilestone` — rejected; nothing about this rule is set from outside the
open editor the way a milestone star is.

## Decision 4: Predecessor editor is a new, smaller sibling of the Decision branch editor — not the same component, not a generalized shared one

**Decision**: A new domain module, `lib/domain/predecessor-editor.ts`, with
its own `PredecessorDraft` type and `reconcilePredecessorDrafts` diff
function, and a new `predecessor-editor.tsx` UI component — structured like
`lib/domain/decision-branches.ts` / `decision-branch-editor.tsx` (spec 014),
but not sharing code with them.

**Rationale**: The two are almost, but not quite, the same shape. A branch
destination can be "an existing step" **or** "a brand-new step created right
here" (`BranchDestination`'s `"new"` variant) — Decision branches routinely
fork into a step that doesn't exist yet. A predecessor never does: FR-002
scopes predecessor selection to "any other step in the process" (existing
steps only; the spec has no scenario for authoring a new step as a
predecessor). Forcing one generic component to cover both would mean the
predecessor editor carries a "create new step" code path it never uses and
can never exercise a test against — Constitution Principle VI says not to
generalize until two call sites actually need the same shape, and here they
don't. `reconcilePredecessorDrafts` is consequently *simpler* than
`reconcileBranchDrafts`: two operation kinds (`delete`, `create`) instead of
three, because there's no `createNewStep` case to diff against.

**Alternatives considered**: Extending `reconcileBranchDrafts` /
`DecisionBranchEditor` with a "direction" parameter to cover both sides —
rejected; the "new step" branch of that logic would be dead code on the
incoming side, and the two editors' seed data already comes from different
shapes (`toStepId` vs `fromStepId`), so the generalization buys nothing but a
harder-to-read shared file.

## Decision 5: The merge wording change lives entirely in the printed-map domain layer + its two renderers — the live canvas is unaffected

**Decision**: `PrintStepInput` (and therefore `FlowRow.step` /
`RolesCell.step`) gains `joinRequiresAll: boolean`, read straight from the
step. `FlowRow.mergesFrom` / `RolesCell.mergesFrom` change shape from
`number[]` (order only) to `{ order: number; label: string }[]`, because the
"requires all" wording must name predecessors (FR-008, "by name" —
`spec.md` User Story 3 Acceptance Scenario 1), while the unmarked "either"
wording must keep reading exactly as it does today, unchanged (FR-007) —
still by order number, not name. Both renderers (`flow-layout.tsx`,
`roles-layout.tsx`) already have every predecessor's order *and* label
available at the point they read `mergesFrom` (it's computed from `byId`,
which holds the full `PrintStepInput`), so this is a same-cost lookup, not a
new one. The live process map's canvas (`process-map-canvas.tsx`) draws
convergence purely as multiple lines meeting at one box — it has never
asserted a convergence in words the way the printed map or the Steps List row
does, so per FR-006 ("no new shape, no new connector style") it is
deliberately left untouched; multiple incoming connections already render
correctly today with no schema or drawing change needed. The Steps List row's
own "Connects from: X" text (currently the one place *besides* the printed
map that describes a convergence in words) is the live map's textual surface
for User Story 3, and picks up the same either/all-by-name distinction.

**Rationale**: Keeps the domain layer's existing "decide what is asserted, not
how it's drawn" contract (see `print-map-layout.ts`'s own header comment)
intact — the renderers still just format what they're given, they don't
compute anything new.

**Alternatives considered**: Passing the full step list into each renderer
separately so it could look up labels itself — rejected; `mergesFrom` already
existing as a resolved-but-thin array (numbers) means widening it to carry
the label too is strictly less code than threading a second lookup table
through both renderer components.

## Decision 6: No change to `validateConnections`

**Decision**: The cross-process check in `validateConnections` is untouched.
A step's arrival rule has no bearing on which connections are structurally
valid — cycles and self-loops are already explicitly permitted today (spec
013), and `joinRequiresAll` doesn't change that; it only changes how an
already-valid set of incoming connections is described.

**Rationale**: Matches Assumptions in `spec.md` — "a documentation fact, not
an execution rule." Nothing here checks predecessor completion in any live
sense, so nothing here needs new structural validation either.
