# Phase 1 Data Model: Process Map Documented Cards

No schema changes. This feature is a rendering redesign — every field it displays already
exists and is already populated by earlier features. Documented here for traceability
between the spec's requirements and the underlying fields.

## Entities read (existing, unchanged)

### ProcessStep
Already the source of a step's core identity on the diagram.
- `id`, `type` (START/TASK/DECISION/END), `label`, `positionX`, `positionY` — unchanged,
  drive node identity and X placement exactly as today.
- `order` (existing explicit ordering) — source of the card's step-number badge (FR-002).
- `assignedRole` / `swimlaneRole` (relation to Role) — source of the card's role line and
  the lane a step is drawn in (unchanged).

### ProcessStepLink
Already the source of a step's cross-process hand-off.
- `targetProcessId` → `targetProcess.code`/`.name` — source of the hand-off chip (FR-004).
  No change: this relation is already loaded by every one of the three rendering surfaces.

### Activity + AuthorityAssignment (via `buildAuthorityTableRows`)
Existing Authority Matrix data, newly *displayed* on the map (not newly collected).
- `AuthorityAssignment.slaDays` → the card's SLA chip (FR-003).
- `AuthorityAssignment.threshold` + `.direction` → a decision card's "gate" line (FR-006).
- Joined to a step via `AuthorityTableRow.stepId` (see research.md — **not** via the
  row's own `id`, which is ambiguous between an Activity id and a Step id).

## Derived (new, view-only) shape

A per-step lookup built at render time on each of the three surfaces — not persisted,
not a new table:

```text
StepAuthoritySummary = {
  slaDays: number | null
  threshold: number | null
  direction: AuthorityDirection   // only meaningful for a DECISION step's gate line
}
```

Built once per page render from `buildAuthorityTableRows(...)`, keyed by `stepId`, and
passed down as a plain lookup (e.g. `Map<string, StepAuthoritySummary>` or a plain object
keyed by step id) alongside the existing `steps` array — the three surfaces each already
have their own props boundary for this (`MapView`/`ProcessMapCanvas` props on the live
canvas; `StaticProcessMapDiagram` props on the print/PDF surface; the PPTX builder's own
step-mapping function). No new server action, no new API route, no new persisted state.

## State transitions

None. This feature has no create/update/delete behavior of its own — a step's SLA,
threshold, role, and links are edited exactly where they are today (Steps List, step
form, Authority Matrix); this feature only changes how already-saved values are drawn.
