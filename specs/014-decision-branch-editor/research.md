# Phase 0 Research: Decision Branch Editor

Five decisions, each resolving a gap between what the spec asks for and what the existing
Steps List UI already does. Nothing here needed a NEEDS CLARIFICATION marker — each had one
reasonable answer once the existing code was read.

## Decision 1 — No new server actions

**Decision**: Compose the three server actions that already exist — `createStepConnection`,
`deleteStepConnection`, `addProcessStep` (which already creates a step and its one incoming
connection atomically) — rather than adding a dedicated branch-editing action.

**Rationale**: A branch, structurally, is just a `StepConnection` from a Decision step. Every
operation the editor needs already has a gated, validated action:
- "link to an existing step" → `createStepConnection`
- "create a new step" → `addProcessStep({ fromStepId: <the decision>, connectionLabel })`,
  which already does step-creation + connection-creation in one transaction
- "remove a branch" → `deleteStepConnection`
- "rename a branch" or "re-point a branch" → `deleteStepConnection` + `createStepConnection`
  (the connection's own id is not referenced anywhere else in the schema, so recreating it
  costs nothing)

FR-015 (access parity) falls out of this for free — these actions are already
`EDITOR`-gated via `requireWorkspaceAccess`, so a new mutation surface with its own gate to
get right and test is exactly the kind of premature abstraction Constitution VI asks to
avoid. `updateStepConnection` was considered and rejected: it would save one network
round-trip on a rename, on a form that is not a hot path.

**Alternatives considered**: A dedicated `setDecisionBranches(decisionStepId, branches[])`
action that reconciles a step's whole branch set server-side in one call. Rejected —
it would duplicate validation (`validateConnections`) that already lives in the actions
above, and the two-or-three branches a Decision step has does not need a bulk-reconciliation
primitive.

## Decision 2 — The popup fires on selecting Decision, in both the add-step and edit-row forms

**Decision**: Both places a step's Type is chosen — `AddStepForm` (a brand-new step) and
`StepListRow`'s edit mode (an existing step) — already hold the Type `<select>` and already
branch their rendered fields on its value (today, showing "Connects from" for every type).
The branch editor becomes the analogous type-conditional block: shown only when
`type === "DECISION"`, opened automatically the moment Type is set to Decision (matching the
description's own "when a decision is selected a pop up yes and now should shows up"), with
a small "Edit branches" affordance to reopen it afterward without re-toggling the Type field.

**Rationale**: This is where the reported gap actually lives — both forms currently show the
same free-text "Connector label" regardless of type. Extending both, the same way, is less
surface than inventing a third place for it.

**Alternatives considered**: A single shared branch-editing surface reached only after a step
is saved (e.g., always via the row's Edit action, never inline in the add form). Rejected —
it would mean adding a Decision step and defining its branches are always two separate trips
through the Steps List, which is a worse experience than what was asked for, for no benefit;
nothing about doing it inline is harder given Decision 3 below.

## Decision 3 — Branches are staged locally and applied on the form's own Save/Submit

**Decision**: A branch box's state (which kind — new step or existing step, its label, and
its destination) is held in the form's local state, the same way `fromStepId` and
`connectionLabel` already are in both `AddStepForm` and `StepListRow`. The actual
`createStepConnection` / `addProcessStep` / `deleteStepConnection` calls run inside the
existing `save()` (or submit handler), after the step itself has been created or updated —
sequential awaits, the same pattern `StepListRow.save()` already uses today to apply its one
connection change after `updateProcessStep` succeeds.

**Rationale**: This is what makes Decision 2 possible without new plumbing: a step being
added in `AddStepForm` has no id yet, so its branches cannot be created until
`addProcessStep`'s own call returns one — which happens inside the same submit handler that
now also applies the staged branches, using the id from that same result. No parent
component needs to track "the step that was just added" across a render; the id never leaves
the handler it's created in.

**Alternatives considered**: Committing each branch box's choice immediately (as its own
optimistic mutation) rather than staging it for Save. Rejected for `AddStepForm` specifically
— the step does not exist yet, so there is nothing to commit against; staging is not optional
there, and using it in `StepListRow` too keeps the two forms' branch editors identical instead
of behaving differently depending on which form they're in.

## Decision 4 — Reconciling staged branches against existing connections on Save

**Decision**: On save, compare the two (or more) staged branch boxes against the Decision
step's current outgoing connections (already loadable — see data-model.md): a box matching an
existing connection's destination is a no-op unless its label changed (→ delete + recreate);
a box with no matching existing connection is a create; an existing connection with no
matching box was removed by the consultant (→ delete). This reconciliation is the same
"diff staged state against loaded state" `StepListRow.save()` already performs for its single
incoming connection (`connectionChanged` check) — generalized from one connection to a small
set.

**Rationale**: Keeps the mental model identical to what a consultant already sees for the
"Connects from" field on every step; nothing new is invented, one field just now supports
more than one row.

## Decision 5 — Self-loops and cycles are not specially validated

**Decision**: No new validation is added for a branch that targets the Decision step itself,
or that would create a cycle with another Decision's branch. `validateConnections`
(`lib/domain/process-graph.ts`) already runs on every connection created through the actions
in Decision 1 and only checks for cross-process connections — it does not reject a self-loop
or a cycle today, for any step type, and this feature does not change that.

**Rationale**: Spec Edge Cases explicitly call out self-loop and same-destination-twice as
allowed. Adding cycle detection would be new business-rule surface affecting every step type,
not something this feature's scope asked for.

**Alternatives considered**: Rejecting a branch that targets the step itself. Rejected — the
spec's own edge case ("No → ask again") treats it as a legitimate shape, and the underlying
data model already permits it.
