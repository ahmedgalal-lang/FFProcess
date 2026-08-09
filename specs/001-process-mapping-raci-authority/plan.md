# Implementation Plan: Process Mapping, RACI & Authority Matrices

**Branch**: `001-process-mapping-raci-authority` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-process-mapping-raci-authority/spec.md`

## Summary

Build FFProcess as a single Next.js (App Router) full-stack application. One workspace-scoped
domain model (Roles, People, Processes/Steps, Activities) is shared by three feature surfaces —
Process Map canvas, RACI Matrix grid, and Authority Matrix — each reading and writing the same
Postgres database through a type-safe ORM, validated with Zod at every server boundary, and
authorized per-workspace on every request. Server Components + Server Actions handle standard
CRUD and validation logic server-side (per Constitution Principle I); a small set of Client
Components handle the two genuinely interactive surfaces (the diagram canvas and the matrix
grids). Export (PDF/Excel/image) and workspace invitations are implemented as route handlers
with their own contracts. The technical approach favors framework-native capabilities over new
infrastructure (Principle VI): no separate backend service, no real-time sync layer, no queue —
Vercel/Node hosting, Postgres, and Next.js server primitives are sufficient for the v1 scope
defined in the spec's Assumptions (single-editor autosave, export-only, simple-flowchart
notation).

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20 LTS runtime

**Primary Dependencies**:
- Next.js 15 (App Router, React Server Components + Server Actions), React 19
- Prisma ORM (type-safe Postgres access, migrations)
- Zod (schema validation shared client/server; types inferred from schemas)
- Auth.js v5 (NextAuth) with email/credentials + optional SSO provider, database session strategy
- `@xyflow/react` (React Flow) for the Process Map canvas (nodes/edges/swimlanes, pan/zoom,
  keyboard navigation hooks) — chosen over a hand-built canvas per Principle VI (a maintained,
  accessible-friendly diagramming library is far simpler than building/maintaining graph layout,
  hit-testing, and pan/zoom ourselves)
- TanStack Table (headless) for the RACI Matrix and Authority Matrix data grids, built on
  native HTML `<table>` markup for grid semantics/keyboard nav (Principle IV)
- Tailwind CSS + shadcn/ui (Radix primitives) for accessible UI components (dialogs, comboboxes,
  toasts) with built-in ARIA behavior
- `@react-pdf/renderer` for PDF export (Process Map, RACI, Authority Matrix), `exceljs` for
  Excel export (RACI, Authority Matrix)
- Resend (or equivalent transactional email provider) for workspace invitation emails
- Vitest + Testing Library for unit/integration tests; Playwright for end-to-end smoke tests of
  the three core workflows (Principle III, Technology Constraints)

**Storage**: PostgreSQL 16 (workspace-scoped relational schema; see data-model.md). Prisma
migrations are the source of truth for schema changes.

**Testing**: Vitest (unit — RACI validation rules, authority threshold resolution, process graph
validation) + Testing Library (component tests for matrix grids) + Playwright (E2E smoke tests:
create workspace → build process map; build & validate RACI matrix; define & query authority
matrix)

**Target Platform**: Web application, server-rendered, deployed to a Node-compatible host
(e.g. Vercel); modern evergreen browsers (Chrome, Firefox, Safari, Edge — last 2 versions)

**Project Type**: Web application — single Next.js project (no separate backend service; see
Project Structure below)

**Performance Goals**: RACI/Authority validation feedback returned in under 5s (SC-002);
Authority Matrix queries answered in under 2s (SC-003); process map interactions (drag, connect,
pan/zoom) feel immediate at up to ~150 steps per map (edge case: 100+ step export, SC covers
legibility not raw speed)

**Constraints**: WCAG 2.1 AA on all matrix/grid/canvas UIs (Constitution Principle IV); all data
access server-side workspace-scoped, no client-trusted authorization (Principle V); TypeScript
`strict`, Zod validation at every external boundary (Principle I)

**Scale/Scope**: Enterprise consulting usage pattern — tens of workspaces per tenant instance,
each with tens of Roles/People, single-digit-to-low-hundreds of process steps/activities per
process, low tens of concurrent editors platform-wide (not internet-consumer scale); this shapes
the choice to skip a dedicated real-time sync layer (Assumptions: single-editor autosave)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Type-Safe Full-Stack | TypeScript strict end-to-end; Zod schemas at every Server Action / route handler boundary; types inferred from schemas, not hand-duplicated | PASS |
| II. Shared Domain Model | Role, Person, Process/Activity modeled once in Prisma schema; RACI Assignment and Approval Rule are join/association tables referencing them, never forked copies | PASS |
| III. Test-First for Business Rules | RACI validation (Accountable/Responsible rules) and Authority threshold resolution are pure, unit-testable functions planned as the first implementation units per feature, with Vitest tests written alongside | PASS (enforced during /speckit-tasks ordering and /speckit-implement) |
| IV. Accessible Data-Dense UI | TanStack Table on semantic `<table>` markup + shadcn/ui (Radix) for keyboard/ARIA; React Flow supports keyboard node selection/movement, chosen partly for this reason | PASS — flagged as an explicit checklist item in Phase 1 quickstart.md |
| V. Workspace Isolation & Least Privilege | All Prisma queries planned to go through a workspace-scoped query helper; every Server Action re-derives the session's authorized workspace/role server-side; no workspace ID trusted from client input alone | PASS |
| VI. Simplicity & Incremental Delivery | Single Next.js project, no microservices/queue/websocket layer; React Flow and TanStack Table adopted only because building either from scratch would violate YAGNI in the other direction (reinventing a maintained primitive) | PASS |

No unjustified violations. Complexity Tracking section below is empty as a result.

**Post-Phase-1 re-check**: `data-model.md`, `contracts/server-actions.md`, and `quickstart.md`
were reviewed against the table above after design — no new dependencies, services, or
cross-cutting mechanisms were introduced beyond what Phase 0 research already justified (React
Flow, TanStack Table, Prisma, Auth.js, `@react-pdf/renderer`/`exceljs`). Workspace-scoping
(Principle V) is structurally present in every contract via the implicit session→Member
derivation; RACI/Authority business rules (Principle III) are isolated in `lib/domain/` per the
Project Structure, confirming they are unit-testable without the web framework. Gate remains
PASS.

**Amendment re-check (2026-08-09, Firm Owner)**: Constitution Principle V was itself amended
(v1.0.0 → v1.1.0) to add the Firm Owner carve-out. The plan's `requireWorkspaceAccess()` helper
(`lib/auth/workspace.ts`, Foundational phase) now resolves access from either an explicit
`Member` row or `FirmMember.role = OWNER`, per `contracts/server-actions.md`'s updated access
paragraph — no new service or architectural layer required, just an additional check inside the
same existing helper. Gate remains PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-process-mapping-raci-authority/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# Option 1 variant: Single Next.js project (App Router) — chosen structure

app/
├── (marketing)/                     # public landing/login pages
│   └── login/
├── (app)/                           # authenticated app shell
│   ├── layout.tsx                   # workspace switcher, nav
│   └── workspaces/
│       └── [workspaceId]/
│           ├── layout.tsx           # workspace-scoped auth guard
│           ├── page.tsx             # workspace dashboard
│           ├── org/                 # Roles & People directory
│           ├── processes/
│           │   └── [processId]/
│           │       ├── map/         # Process Map canvas
│           │       └── raci/        # RACI Matrix grid
│           ├── authority/           # Authority Matrix + query tool
│           └── members/             # invitations & access levels
├── api/
│   ├── auth/[...nextauth]/          # Auth.js route handler
│   ├── export/
│   │   ├── process-map/[id]/
│   │   ├── raci/[id]/
│   │   └── authority/[id]/
│   └── invitations/[token]/accept/
└── actions/                         # Server Actions, grouped by domain
    ├── org.ts                       # Role/Person CRUD
    ├── process.ts                   # Process/Step CRUD
    ├── raci.ts                      # RACI assignment + validation
    ├── authority.ts                 # Decision Type/Approval Rule CRUD + query
    └── membership.ts                # invite/accept/role-change

lib/
├── domain/                          # pure, framework-free business logic
│   ├── raci-validation.ts           # Accountable/Responsible rule checks
│   ├── authority-resolution.ts      # threshold/co-approval resolution
│   └── process-graph.ts             # step sequencing/cycle handling
├── auth/                            # session + workspace-scoping helpers
├── db/                              # Prisma client singleton
└── export/                          # PDF/Excel/image generation

components/
├── process-map/                     # React Flow canvas + custom nodes
├── raci-grid/                       # TanStack Table RACI grid
├── authority-grid/                  # TanStack Table Authority grid + query UI
└── ui/                              # shadcn/ui primitives

prisma/
├── schema.prisma
└── migrations/

tests/
├── unit/                            # lib/domain/* business rule tests (Vitest)
├── integration/                     # Server Action + Prisma tests against test DB
└── e2e/                             # Playwright: the 3 core workflows
```

**Structure Decision**: Single Next.js App Router project — no separate backend/frontend split.
Business logic that must be unit-tested per Principle III lives in framework-free modules under
`lib/domain/`, called from Server Actions in `app/actions/`, so the RACI/Authority rules are
testable without spinning up HTTP or React. Feature UIs are grouped under
`app/(app)/workspaces/[workspaceId]/...` to make the workspace-scoping boundary (Principle V)
structurally obvious — every route under it requires a resolved, authorized workspace.

## Complexity Tracking

*No Constitution Check violations — table intentionally left empty.*
