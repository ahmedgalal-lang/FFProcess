# Implementation Plan: Decision Branch Editor

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-decision-branch-editor/spec.md`

## Summary

Add a real two-branch editor to the Steps List, shown only when a step's Type is Decision —
alongside its existing fields, not replacing them: the plain "connects from" field every step
type already has describes what precedes a step, a separate question from what a Decision
branches to, and stays exactly as it is for every type. Each branch (Yes/No by default,
renamable, and extendable beyond two) can target a brand-new step or an existing one,
including looping back to an earlier step. The feature adds no new server action or schema —
a branch is exactly a `StepConnection` from a Decision step, and every mutation the editor
needs — create a connection, delete one, create a step with its own incoming connection — is
already an `EDITOR`-gated action. It does add one small pure domain module (reconciling staged
branch boxes against a step's existing outgoing connections). What's otherwise new is purely
the UI: a type-conditional editor in both the add-step form and the per-row editor, staging
its boxes locally and reconciling them against the step's existing outgoing connections on
Save, the same pattern the Steps List already uses for a step's one incoming
connection.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router

**Primary Dependencies**: none added. No new package; this composes three existing server
actions (`createStepConnection`, `deleteStepConnection`, `addProcessStep`).

**Storage**: PostgreSQL via Prisma 7. No schema change — `StepConnection` already carries an
optional `label` and already allows any number of outgoing connections from one step.

**Testing**: Vitest for any small pure helper the reconciliation logic needs (e.g. diffing
staged branch boxes against loaded connections — see research.md Decision 4); Playwright for
the editor's own behavior, since every requirement here is a property of what the Steps List
shows and does.

**Target Platform**: the Process Map's Steps List (`/workspaces/[workspaceId]/processes/[processId]/map`,
list view), both its add-step form and its per-step edit row.

**Project Type**: web application (Next.js, single project).

**Performance Goals**: none beyond the existing page's — this is a same-page UI addition with
no new query (the process's full connection list is already loaded for the interactive
canvas) and no new network round-trip class (Save already makes multiple sequential action
calls when a step's connection changes).

**Constraints**: the branch editor must not appear for Task/Start/End steps (FR-001); must
not alter how the live canvas or printed map render an existing connection's label (FR-013).

**Scale/Scope**: a Decision step typically carries two branches; the editor supports more
without a hard ceiling (User Story 3). No process in the product has more than a handful of
Decision steps, so no pagination or virtualization concern.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | How this plan satisfies it |
|---|---|
| **I. Type-Safe Full-Stack** | No new server boundary — every mutation goes through the three existing Zod-validated actions. The client-side `BranchDraft` shape (data-model.md) is a plain TypeScript type, not a schema boundary, because it never crosses the network as-is; each reconciled operation is validated exactly as it is today. |
| **II. Shared Domain Model** | No new entity. A branch is a `StepConnection`, read and written through the same table every other connection already uses — nothing forks or parallels the existing model. |
| **III. Test-First for Business Rules** | The one piece of real logic — reconciling staged branch boxes against a step's existing outgoing connections (research.md Decision 4) — is a pure function and gets unit tests before the UI that calls it, mutation-checked. Everything else is UI composition over already-tested actions. |
| **IV. Accessible, Data-Dense UI** | The branch editor is a form (labeled fields, keyboard-operable selects and inputs), not a canvas interaction — consistent with the Steps List's existing accessibility bar, checked against the same sweep other step-editing controls already pass. |
| **V. Workspace Isolation** | No new gate needed: every mutation is one of the three actions already gated `EDITOR` via `requireWorkspaceAccess`, scoped to the process's own workspace (research.md Decision 1, spec FR-015). |
| **VI. Simplicity & Incremental Delivery** | The two-box default (User Stories 1–2) is shippable on its own; "more than two branches" (User Story 3) is a strictly additive third slice — the editor's box list has no fixed length from the start, so nothing built for the MVP needs reworking to support it. No new action, schema, or abstraction is introduced (research.md Decision 1). |

**No violations.** Nothing in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/014-decision-branch-editor/
├── plan.md              # this file
├── spec.md              # what a reader must be able to do
├── research.md           # Phase 0 — five decisions, all resolved from existing code
├── data-model.md         # Phase 1 — no schema change; the derived and staged shapes
├── quickstart.md         # how to prove it works
└── checklists/requirements.md
```

No `contracts/` directory: this feature introduces no new server action or external
interface (research.md Decision 1) — precedent for skipping it when nothing new is exposed
is `specs/002-process-map-cards/`.

### Source Code

```text
app/(app)/workspaces/[workspaceId]/processes/[processId]/map/
├── decision-branch-editor.tsx   # NEW — the two-(or-more)-box editor: shared between
│                                 #   step-form.tsx and step-list-row.tsx, staged local
│                                 #   state in, reconciled operations out via a callback
├── step-form.tsx                # CHANGED — renders the branch editor instead of the
│                                 #   plain connector field when Type is Decision;
│                                 #   applies staged branches after addProcessStep succeeds
├── step-list-row.tsx             # CHANGED — same swap in edit mode; passes each row its
│                                 #   own outgoing connections (already available from
│                                 #   the process's full connection list) alongside the
│                                 #   incoming one it already receives
├── map-view.tsx                  # CHANGED — computes outgoingConnectionsOf alongside the
│                                 #   existing incomingConnectionOf, passes it to each row
└── process-map-canvas.tsx        # UNCHANGED — connections already render their own label
                                   #   per edge (process-map-canvas.tsx:buildEdge); nothing
                                   #   here needs to change for FR-013

lib/domain/
└── decision-branches.ts          # NEW — the one pure function: reconcile staged branch
                                   #   boxes against a step's existing outgoing connections
                                   #   into create/update/delete operations (research.md
                                   #   Decision 4), test-first per Constitution III

lib/actions/process.ts            # UNCHANGED — createStepConnection, deleteStepConnection,
                                   #   addProcessStep already do everything this feature
                                   #   needs (research.md Decision 1)

prisma/schema.prisma               # UNCHANGED — no migration

app/reports/[workspaceId]/printed-map/   # UNCHANGED — already renders a connection's own
                                   #   label (spec 013); FR-013 is satisfied by not touching it

tests/
├── unit/decision-branches.test.ts        # NEW — the reconciliation function, test-first
└── e2e/decision-branch-editor.spec.ts    # NEW — the measured user stories, through the
                                            #   real Steps List
```

**Structure Decision**: the new editor lives beside `step-form.tsx` and `step-list-row.tsx`
rather than under a new top-level directory — it is a component those two files render, not
a separate feature surface, and both already live under this `map/` directory. The one pure
function goes to `lib/domain/`, matching where every other reusable business rule in this
codebase lives (Constitution II/III), not colocated with either form.
