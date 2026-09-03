# Phase 0 Research: Process Map Documented Cards

## Unknowns from Technical Context

None required external research — every unknown was resolved by reading the existing
codebase directly, since this feature redraws an existing diagram using data the app
already models, rather than introducing new technology or data.

## Decision: Reuse `assignSwimlanes` / `layoutOrgChart` / `buildMilestoneRails` for layout math

**Decision**: The three rendering surfaces (live canvas, static/print diagram, PPTX) keep
using the same pure layout functions they already use today
(`lib/domain/process-layout.ts#assignSwimlanes` for lane placement, step `positionX` for
horizontal placement). No new layout algorithm is introduced.

**Rationale**: These functions are already the single source of truth for "where does this
step sit" across the interactive canvas and the static/print diagram (established in prior
work fixing a swimlane placement bug). Reusing them for the redesign, rather than writing
new layout math, keeps the three surfaces from disagreeing about node position — only the
node's *drawn shape and content* changes, not its position. Matches Constitution Principle
VI (Simplicity) and avoids a second, competing layout implementation.

**Alternatives considered**: A dedicated "card layout" module with more spacing built in —
rejected because the existing lane/X-position math has no coupling to the old node's pixel
size; taller/wider cards are a pure sizing change (`LANE_HEIGHT`, node half-sizes), not a
placement-algorithm change.

## Decision: Source each step's SLA/threshold/approver via `buildAuthorityTableRows`, keyed by `stepId`

**Decision**: To show a step's SLA and (for decisions) its approval threshold on the card,
call the existing `buildAuthorityTableRows(steps, activities, authorityAssignments)` (from
`lib/domain/authority-table.ts` — the same builder the Authority Matrix page already uses)
and index its output by each row's own `stepId` field, then look up per step.

**Rationale**: Investigated three candidate sources:
1. `ExportProcessData.combinedRows` (used by the Export Report / PPTX today) — keyed by
   `rowId`, which is **the Activity's id when a step has a related activity, and only
   falls back to the step's id when it doesn't** (see `buildRaciTableRows`'s row `id`
   convention). A lookup by `rowId === step.id` — the pattern the report currently uses
   for the small "documented step" narrative cards — silently misses SLA data for any
   step that *does* have a related activity, which is the common case. This is a
   pre-existing narrow gap in the report code, not something to copy into the new cards.
2. `AuthorityTableRow` (from `buildAuthorityTableRows`) — carries a **`stepId: string | null`**
   field independently of its own `id`, precisely to avoid this ambiguity. This is the
   correct join key.
3. A brand-new query/aggregation — rejected; both `activities` and `authorityAssignments`
   are **already fetched** on the live Process Map page
   (`app/(app)/workspaces/[workspaceId]/processes/[processId]/map/page.tsx`), currently
   only to compute per-step "gaps" via `deriveGapsByStep`. No new Prisma query is needed on
   that page — only a new derived map passed down alongside the existing props. The static
   report/PDF and PPTX paths already load equivalent data (`activities`,
   `authorityAssignments` in `lib/reports/load-report-data.ts`) and can build the same
   `stepId`-keyed map locally.

**Edge case**: if more than one activity/row maps to the same `stepId` (uncommon, but
possible), take the first by the existing `order` field — consistent with how activities
are already ordered everywhere else in the app. Not a case that changes user-facing
behavior enough to warrant a spec-level decision; documented here as an implementation
default.

## Decision: Print-safe card fragmentation reuses the `.print-stack` pattern

**Decision**: Any newly-print-rendered stacked content introduced by this feature (if any)
follows the existing `.print-stack` CSS utility (`display: block` under `@media print`,
added to `export-preview.tsx` for exactly this reason) rather than a flex/grid column.

**Rationale**: Chromium's print engine does not reliably fragment flex/grid containers
across pages — already diagnosed and fixed for the Export Report's Internal Roles and
Value Chain lists in this same codebase. The redesigned diagram itself is absolutely-
positioned nodes inside a fixed-size canvas (not a flow list), so this mainly matters if
any new *textual* list is added near the diagram; noted here so the same mistake isn't
reintroduced.

## Decision: No new dependency, no schema change

**Decision**: Ship entirely within the existing stack — `@xyflow/react` for the live
canvas, plain DOM/CSS for the static print diagram, `pptxgenjs` (already added for the
PPTX export) for the slide diagram. No new npm package. No Prisma migration — every field
displayed on the card (step order, role, SLA, threshold, cross-process link) already
exists on `ProcessStep` / `AuthorityAssignment` / `ProcessStepLink`.

**Rationale**: Constitution Principle VI (Simplicity) and Principle II (Shared Domain
Model) — the data already exists and is already queried elsewhere; introducing a new
table or a new library for a rendering change would be unjustified complexity.
