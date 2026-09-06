# Phase 0 Research: Process Ordering

Four questions had to be settled before design. Each is answered from what this codebase
already does, so the feature adds a second instance of an existing pattern rather than a new
one (Principle II, Principle VI).

## R1 — How does one `order` column express a two-level tree?

**Decision**: One `order` integer on `Process`, meaningful only among siblings. Top-level
processes are ordered against each other; a parent's sub-processes are ordered against each
other. Rendering walks top-level processes in order and emits each one's children in order
directly beneath it — which is exactly what the Processes page's existing grouping does, just
with a chosen sequence instead of `code` ascending.

**Rationale**: The grouping already exists (`topLevel.flatMap((p) => [p, ...childrenOf(p.id)])`
in the Processes page). Keeping `order` sibling-scoped means "move a parent" is a swap among
top-level processes and "move a child" is a swap among that parent's children — so FR-003
(sub-processes never separated from their parent) is a property of the data shape, not a rule
that has to be enforced and can be got wrong.

**Alternatives considered**:
- *A single flat order across the whole workspace*: makes it possible to place a child away
  from its parent, so FR-003 becomes a runtime invariant to police on every move. Rejected.
- *A separate `ProcessOrder` join table*: more moving parts for a single integer, and nothing
  else in this schema does it (steps and phases both use a plain `order` column). Rejected.

## R2 — Where does a pack's own order live?

**Decision**: In the report's own link. The export picker already submits a plain
`GET` form to `/reports/{workspaceId}` with one `ids` parameter per selected process, so the
link already names the pack's processes in sequence. Arranging a pack means submitting those
ids in a different sequence; nothing is stored.

**Rationale**: This is what makes FR-014 (a pack never writes back to the library) true by
construction rather than by discipline — there is nothing to write. It also satisfies FR-016
for free: the order travels with the link, so re-opening or sharing a report reproduces it.
And it avoids inventing a stored "pack" entity that the user would then have to name, find and
delete (Principle VI).

**Consequence that must be handled**: `loadReportData` currently issues
`findMany({ where: { id: { in: processIds } }, orderBy: { code: "asc" } })`, which discards the
incoming sequence twice over — `IN` does not preserve argument order, and `orderBy` overrides
it regardless. The incoming order has to be re-applied in application code after the query.

**Alternatives considered**:
- *A stored `ReportPack` row*: durable and nameable, but a whole entity and its lifecycle for
  what is currently a shareable URL. Rejected as premature.
- *Session or local storage*: not shareable, and the report link is the artefact people
  actually send. Rejected.

## R3 — How does the picker submit an arranged order?

**Decision**: The picker's list becomes client-side reorderable, with move-up/move-down
buttons per row, and the form submits the checkboxes in the arranged DOM order.

**Rationale**: A native `GET` form serialises its controls in DOM order, so reordering the rows
*is* reordering the query string — no hidden index fields, no client-side URL building.
Move-up/down buttons are keyboard-operable, which drag-and-drop alone is not (Principle IV),
and match the Steps List, which solved this same problem in this product already.

**Alternatives considered**:
- *Drag-and-drop*: fails Principle IV on its own and needs a library; can be added later on top
  of the same underlying operation. Rejected for now.
- *A numeric "position" input per row*: keyboard-operable, but makes the user do arithmetic and
  allows invalid states (duplicate or out-of-range positions). Rejected.

## R4 — What happens to workspaces that already exist?

**Decision**: The migration backfills `order` per workspace, and per parent, following the
current `code` ascending sequence. New processes are appended at the end of their level.

**Rationale**: FR-005 and the "existing workspaces start in their current order" assumption:
nothing may appear to move on the deploy that introduces this. Backfilling from the order the
list is in today makes the first render after deploy identical to the last render before it.
`code` ascending also remains the tie-break comparator afterwards, so equal or absent positions
(concurrent edits, rows seeded outside the app) still resolve deterministically rather than
letting the database return rows in whatever order it likes.

**Alternatives considered**:
- *Default everything to `0` and rely on the `code` tie-break*: correct-looking on day one, but
  the first move of any process would renumber only that one and scatter the rest. Rejected.
- *Backfill by creation time*: does not match what users currently see. Rejected.
