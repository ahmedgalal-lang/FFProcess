<!--
Sync Impact Report
- Version change: [TEMPLATE] → 1.0.0 (initial ratification)
- Modified principles: n/a (first adoption)
- Added sections:
  - Core Principles: I. Type-Safe Full-Stack, II. Shared Domain Model,
    III. Test-First for Business Rules, IV. Accessible Data-Dense UI,
    V. Workspace Isolation & Least Privilege, VI. Simplicity & Incremental Delivery
  - Technology & Architecture Constraints
  - Development Workflow & Quality Gates
  - Governance
- Removed sections: none (template placeholders only)
- Follow-up TODOs: none
-->

# FFProcess Constitution

## Core Principles

### I. Type-Safe Full-Stack
The application MUST be built on Next.js (App Router) with TypeScript in `strict` mode
end-to-end — server components, route handlers, and client components alike. Every
boundary that crosses trust (API route handlers, server actions, form submissions,
external imports) MUST validate input with a schema library (e.g. Zod) before it touches
business logic. Inferred types from schemas MUST be the single source of truth shared
between client and server — do not hand-maintain parallel `interface` definitions that can
drift from validation. `any` is prohibited outside isolated, commented interop shims.

Rationale: process maps, RACI matrices, and authority matrices are structured, relational
data entered by non-technical business users; silent type or validation drift produces
incorrect approval chains or ownership records, which is a business-critical failure mode,
not a cosmetic bug.

### II. Shared Domain Model
Process Mapping, RACI, and Authority Matrix are three views over one underlying domain:
Organizations/Workspaces, People, Roles, and Activities/Steps. These core entities MUST be
modeled once and referenced (not duplicated) by each feature area — a Role or Person
created for a RACI matrix MUST be reusable in an Authority Matrix or Process Map without
re-entry. Feature-specific data (e.g. RACI assignment codes, authority thresholds, process
step ordering) attaches to the shared entities via join/association tables, never by
forking the entity itself.

Rationale: the three matrix types describe the same organization from different angles;
consultants populate org structure once per client engagement and reuse it — duplicated
entities would immediately desynchronize and undermine the tool's core value.

### III. Test-First for Business Rules
Domain/business-rule logic (RACI validation — e.g. exactly one Accountable per activity;
authority threshold and approval-chain resolution; process step sequencing/branching
validation) MUST have automated tests written before or alongside implementation, and
these tests MUST fail before the implementation makes them pass. UI rendering and pure
styling do not require this rigor, but anything that decides "is this matrix valid" or
"who can approve this" does. Pull requests that add or change business-rule logic without
corresponding tests MUST be rejected in review.

Rationale: these rules encode real governance and compliance requirements for client
organizations; a silent regression here produces incorrect real-world sign-off authority,
not just a UI glitch.

### IV. Accessible, Data-Dense UI
All matrix/grid interfaces (RACI grids, authority tables, process map canvases) MUST be
usable via keyboard alone and MUST meet WCAG 2.1 AA at minimum — correct semantic
structure/ARIA for grids, visible focus states, and color contrast that does not rely on
color alone to convey RACI codes or approval status. Every new interactive component MUST
be checked against this bar before being considered done; it is not a follow-up task.

Rationale: target users are enterprise operations/PMO/compliance staff doing dense,
repetitive data entry across large org structures — accessibility here is also a
usability requirement for the primary workflow, not a compliance checkbox.

### V. Workspace Isolation & Least Privilege
All persisted data MUST be scoped to a Workspace (representing one client engagement or
business unit) at the schema level, and every query MUST be filtered by the requesting
user's authorized workspace(s) — there is no implicit cross-workspace read or write.
Authorization checks MUST live on the server (route handlers/server actions/middleware),
never be enforced by hiding UI alone. Role-based access within a workspace (e.g. viewer,
editor, workspace admin) MUST be explicit and checked server-side per action.

Rationale: consultants manage multiple client engagements concurrently in one instance;
a workspace data leak (even accidental) is a client-confidentiality incident, not just a
bug.

### VI. Simplicity & Incremental Delivery
Build the smallest working vertical slice for each capability before generalizing.
Do not introduce an abstraction, plugin system, or configuration layer until at least two
concrete call sites need it (YAGNI). Prefer Next.js and platform-native capabilities
(server actions, route handlers, built-in caching) over adding a new library or service
when the built-in option is sufficient. Every deferred simplification or known shortcut
MUST be recorded (e.g. as a TODO with a tracked follow-up), not silently left implicit.

Rationale: this is a green-field product; premature architecture optimizes for imagined
scale instead of shipping the process-mapping/RACI/authority workflows the user actually
needs validated first.

## Technology & Architecture Constraints

- Framework: Next.js (App Router), TypeScript strict mode, React Server Components by
  default; Client Components only where interactivity requires them.
- Data layer: a relational database (e.g. PostgreSQL) accessed through a type-safe ORM
  (e.g. Prisma or Drizzle); raw SQL is permitted only for cases the ORM cannot express,
  and MUST be parameterized (never string-concatenated).
- Validation: Zod (or equivalent) schemas at every external boundary (API routes, server
  actions, form inputs); schema-inferred types are shared between server and client.
- Authentication/Authorization: session-based or token-based auth via an established
  library (e.g. Auth.js) — no hand-rolled password/session cryptography. Authorization
  decisions enforced server-side per Principle V.
- Testing: unit/integration tests for business logic (e.g. Vitest/Jest), and at minimum
  smoke-level end-to-end coverage of the three core workflows (create process map, build
  RACI matrix, define authority matrix) using a tool such as Playwright.
- State/data-fetching: prefer server-driven data flow (Server Components, server actions,
  route handlers) over ad hoc client-side global state; introduce a client state library
  only where a specific interaction genuinely requires it (e.g. live canvas editing).
- Multi-tenancy: workspace scoping is a first-class schema concern from the first
  migration, not retrofitted later.

## Development Workflow & Quality Gates

- Development follows the Spec Kit workflow: `/speckit-constitution` →
  `/speckit-specify` → (`/speckit-clarify` as needed) → `/speckit-plan` →
  `/speckit-tasks` → (`/speckit-checklist` as needed) → `/speckit-implement`. Feature work
  MUST originate from a spec and plan under `specs/`, not be implemented ad hoc.
- Every pull request MUST state which Core Principles it touches and confirm compliance;
  deviations MUST be explicitly justified in the PR description or plan's Complexity
  Tracking section.
- Automated checks (type-check, lint, tests) MUST pass before merge; business-rule test
  coverage per Principle III is a merge blocker, not a suggestion.
- Accessibility (Principle IV) and workspace-isolation (Principle V) checks MUST be part
  of feature review for any change touching matrix UIs or data access, respectively.

## Governance

This constitution supersedes ad hoc practice for this project. Amendments are made via
the `/speckit-constitution` command, which MUST update this file, record a Sync Impact
Report, and bump the version according to semantic versioning:

- MAJOR: backward-incompatible principle removal or redefinition.
- MINOR: a new principle or materially expanded section is added.
- PATCH: clarification, wording, or non-semantic refinement.

All plans (`/speckit-plan`) and pull requests MUST verify compliance with this
constitution; any unavoidable deviation MUST be documented with rationale and, where
possible, a path back to compliance. Complexity that is not justified against these
principles MUST be simplified before merge.

**Version**: 1.0.0 | **Ratified**: 2026-08-09 | **Last Amended**: 2026-08-09
