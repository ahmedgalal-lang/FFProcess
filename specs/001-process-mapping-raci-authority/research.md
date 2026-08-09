# Phase 0 Research: Process Mapping, RACI & Authority Matrices

All Technical Context fields in `plan.md` were resolved directly from the constitution's
Technology & Architecture Constraints and the spec's Assumptions; no items were left as
`NEEDS CLARIFICATION`. This document records the rationale and alternatives considered for the
non-obvious choices.

## 1. Process Map canvas library

- **Decision**: `@xyflow/react` (React Flow).
- **Rationale**: Provides node/edge graph rendering, pan/zoom, connection-drawing, and a
  documented pattern for custom node types (needed for decision diamonds and swimlane grouping)
  out of the box. Actively maintained, TypeScript-native, and exposes keyboard interaction hooks
  that give a real path to the WCAG 2.1 AA bar in Constitution Principle IV, rather than needing
  to build keyboard support into a hand-rolled canvas from zero.
- **Alternatives considered**:
  - *Hand-built SVG/Canvas editor*: full control, but reimplements hit-testing, drag/connect
    interactions, and pan/zoom — directly conflicts with Principle VI (Simplicity) for a v1 with
    no unusual diagramming requirement the library can't meet.
  - *Konva.js*: canvas-based (not DOM), which makes achieving accessible/keyboard-navigable nodes
    significantly harder — works against Principle IV.
  - *Full BPMN.io toolkit*: brings full BPMN 2.0 semantics/validation, which the spec's
    Assumptions explicitly place out of scope for v1 (simple flowchart notation only) — would be
    over-scoped complexity.

## 2. RACI / Authority Matrix grid

- **Decision**: TanStack Table (headless) rendered on native `<table>`/`<th>`/`<td>` markup.
- **Rationale**: Headless means we own the exact markup, so we can guarantee correct grid
  semantics (`scope`, `role="grid"` where appropriate, arrow-key cell navigation) required by
  Principle IV, while TanStack handles column/row modeling, sorting, and cell-state management so
  we don't hand-roll that layer — a reasonable simplicity/accessibility tradeoff.
- **Alternatives considered**:
  - *AG Grid / other batteries-included grid components*: strong feature set but heavier
    dependency and less control over exact DOM/ARIA output; overkill for grids of the size
    implied by Scale/Scope (low hundreds of rows/columns, not spreadsheet-scale).
  - *Hand-rolled `<table>` with local state only*: viable for a single grid, but RACI and
    Authority Matrix both need equivalent row/column/cell modeling — sharing one headless layer
    avoids duplicating that logic per Principle VI.

## 3. Data layer

- **Decision**: PostgreSQL + Prisma ORM.
- **Rationale**: Matches the constitution's explicit technology constraint (relational DB +
  type-safe ORM). Prisma's generated client gives compile-time-checked queries and a single
  schema file that doubles as living documentation of the shared domain model (Principle II),
  plus first-class migration tooling needed since this is a multi-environment, multi-workspace
  schema from day one (Principle V: workspace scoping "from the first migration").
- **Alternatives considered**: Drizzle ORM — comparable type-safety story; Prisma chosen for
  its more mature migration workflow and generated-client ergonomics for a team-of-consultants
  product where schema will evolve across the three feature areas in parallel. Either satisfies
  the constitution; this is a preference-level pick, not a hard requirement.

## 4. Authentication & authorization

- **Decision**: Auth.js v5 with database session strategy; workspace membership/role checked
  server-side on every Server Action and route handler via a shared `requireWorkspaceAccess()`
  helper in `lib/auth/`.
- **Rationale**: Constitution explicitly rules out hand-rolled session/password cryptography.
  Database sessions (vs. pure JWT) make instant access revocation possible when a workspace admin
  removes a member — important given Principle V's "no implicit cross-workspace read or write."
- **Alternatives considered**: JWT session strategy — simpler infra but revocation requires a
  denylist or short TTL + refresh dance; unnecessary complexity for this project's scale.

## 5. Export (PDF / Excel / image)

- **Decision**: `@react-pdf/renderer` for PDF (Process Map, RACI, Authority Matrix all render as
  React trees we already have); `exceljs` for Excel (RACI, Authority Matrix, which are inherently
  tabular); Process Map image export via serializing the React Flow canvas (built-in
  viewport-to-image utility) to PNG.
- **Rationale**: Both libraries run inside the Node runtime a Next.js route handler already
  provides — no headless-browser dependency needed for the common cases, keeping deployment
  simple (Principle VI). Reuses the same data shapes already modeled for on-screen rendering
  rather than introducing a parallel export-only representation.
- **Alternatives considered**: Puppeteer/headless-Chrome "print the page" approach — works for
  any layout including the canvas, but adds a heavy runtime dependency and cold-start cost;
  reserved as a fallback only if `@react-pdf/renderer` proves insufficient for complex map layouts
  during implementation, not adopted upfront.

## 6. Concurrency model for autosave

- **Decision**: Optimistic single-editor autosave — each save carries the record's last-known
  `updatedAt`/version; a conflicting save (edge case: two tabs) is rejected with a
  "changed elsewhere, reload to continue" response rather than silently overwritten.
- **Rationale**: Matches the spec's documented Assumption (no real-time multi-cursor editing in
  v1) while still satisfying FR-017 (must not silently discard unsaved changes) without building
  a CRDT/OT sync layer, consistent with Principle VI and the Scale/Scope (low tens of concurrent
  editors, not a mass real-time editing product).
- **Alternatives considered**: Real-time collaborative sync (Yjs/CRDT) — explicitly out of scope
  per spec Assumptions; revisit only if a future spec amendment brings multi-cursor editing into
  scope.
