---

description: "Task list for Process Mapping, RACI & Authority Matrices"
---

# Tasks: Process Mapping, RACI & Authority Matrices

**Input**: Design documents from `/specs/001-process-mapping-raci-authority/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md

**Tests**: Included. Constitution Principle III mandates test-first for business-rule logic
(RACI validation, authority threshold resolution, process-graph rules); those test tasks are
marked "write first, must fail before implementation" and are not optional. Contract/E2E tests
for the rest of the flow are included per quickstart.md but may be trimmed if the user wants a
faster path to a UI demo.

**Organization**: Tasks are grouped by user story (US1-US5, matching spec.md priorities P1-P5)
to enable independent implementation, testing, and incremental delivery.

## Path Conventions

Single Next.js App Router project per plan.md's Project Structure — `app/`, `lib/`,
`components/`, `prisma/`, `tests/` at repository root.

---

## Phase 1: Setup

**Purpose**: Project initialization and tooling

- [ ] T001 Initialize Next.js 15 project (App Router, TypeScript strict, Tailwind CSS) at repository root
- [ ] T002 [P] Install and initialize shadcn/ui component library, configure `components/ui/`
- [ ] T003 [P] Install Prisma, initialize `prisma/schema.prisma` with PostgreSQL datasource
- [ ] T004 [P] Install Zod, Auth.js v5, `@xyflow/react`, `@tanstack/react-table`, `@react-pdf/renderer`, `exceljs`, Resend SDK
- [ ] T005 [P] Configure Vitest + Testing Library (`vitest.config.ts`, `tests/unit/`, `tests/integration/` setup)
- [ ] T006 [P] Configure Playwright (`playwright.config.ts`, `tests/e2e/` setup)
- [ ] T007 [P] Configure ESLint + Prettier for TypeScript strict mode per Constitution Principle I
- [ ] T008 Create `.env.example` documenting `DATABASE_URL`, `AUTH_SECRET`, email provider credentials

**Checkpoint**: `pnpm dev` runs an empty Next.js app; `pnpm test` and `pnpm test:e2e` run (no tests yet)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared domain schema, auth, and workspace-scoping infrastructure that every user
story depends on. **No user story work can begin until this phase is complete.**

- [ ] T009 Define core Prisma models — `Workspace`, `User`, `Member` — in `prisma/schema.prisma` per data-model.md
- [ ] T010 Add `Role`, `Person`, `PersonRole` models to `prisma/schema.prisma` per data-model.md
- [ ] T011 Add `Process`, `ProcessStep`, `StepConnection`, `Activity` models to `prisma/schema.prisma` per data-model.md
- [ ] T012 Add `RaciAssignment`, `RaciMatrixStatus` models to `prisma/schema.prisma` per data-model.md
- [ ] T013 Add `DecisionType`, `ApprovalRule` models to `prisma/schema.prisma` per data-model.md
- [ ] T014 Run initial Prisma migration (`pnpm prisma migrate dev --name init`) and commit `prisma/migrations/`
- [ ] T015 [P] Implement Prisma client singleton in `lib/db/client.ts`
- [ ] T016 [P] Configure Auth.js (database session strategy) in `lib/auth/config.ts` and `app/api/auth/[...nextauth]/route.ts`
- [ ] T017 Implement `requireWorkspaceAccess(workspaceId, minLevel)` server-side helper in `lib/auth/workspace.ts` (Constitution Principle V — every Server Action/route handler will call this)
- [ ] T018 [P] Implement shared `ActionError` discriminated union and helper builders in `lib/actions/errors.ts` per contracts/server-actions.md
- [ ] T019 Implement authenticated app shell — `app/(app)/layout.tsx` (workspace switcher) and `app/(app)/workspaces/[workspaceId]/layout.tsx` (calls `requireWorkspaceAccess`, 404/redirect on non-membership)
- [ ] T020 [P] Implement `prisma/seed.ts` seeding one demo Workspace with sample Roles/People for local development and E2E tests

**Checkpoint**: Authenticated users can sign in, land in an empty workspace shell; unauthenticated
or non-member access to a workspace route is rejected server-side. Foundation ready for all
user stories.

---

## Phase 3: User Story 1 - Map a Process with the Org Behind It (Priority: P1) 🎯 MVP

**Goal**: Create a Workspace, define Roles/People, and build a Process Map with sequenced,
Role-assigned, swimlaned steps that autosave and persist across reloads.

**Independent Test**: Create a workspace, add 3+ Roles/People, build a 5+ step process map with
a decision point and a swimlane; reload and confirm it renders identically (quickstart.md
Scenario 1).

### Tests for User Story 1

- [ ] T021 [P] [US1] Unit test process-graph rules (connections must share `processId`, cycles permitted) in `tests/unit/process-graph.test.ts` — write first, must fail
- [ ] T022 [P] [US1] Integration test `createProcess`/`saveProcessMap` optimistic-concurrency behavior in `tests/integration/process.test.ts`

### Implementation for User Story 1

- [ ] T023 [P] [US1] Implement `lib/domain/process-graph.ts` (connection validation per T021) — implement only after T021 fails
- [ ] T024 [P] [US1] Implement `createRole`, `archiveRole`, `createPerson`, `archivePerson`, `setPersonRoles` Server Actions in `app/actions/org.ts` per contracts/server-actions.md
- [ ] T025 [US1] Implement `createProcess`, `saveProcessMap` (optimistic concurrency via `expectedUpdatedAt`), `createActivity`, `reorderActivities` Server Actions in `app/actions/process.ts` (depends on T023)
- [ ] T026 [P] [US1] Build Org directory UI (Roles/People list, create/archive forms) in `app/(app)/workspaces/[workspaceId]/org/page.tsx`
- [ ] T027 [P] [US1] Build Process list/create UI in `app/(app)/workspaces/[workspaceId]/processes/page.tsx`
- [ ] T028 [US1] Build Process Map canvas with `@xyflow/react` — custom Start/Task/Decision/End node types, swimlane-by-Role grouping — in `components/process-map/`
- [ ] T029 [US1] Wire Process Map page with debounced autosave calling `saveProcessMap` and conflict ("changed elsewhere") handling in `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/page.tsx` (depends on T025, T028)
- [ ] T030 [US1] Add keyboard node selection/movement and ARIA labeling to the canvas per Constitution Principle IV (depends on T028)
- [ ] T031 [US1] E2E test: quickstart.md Scenario 1 in `tests/e2e/process-map.spec.ts`

### Process Coding & Hierarchy (amendment 2026-08-09, US1)

Adds Process Codes (e.g. "SAL101"), main/sub-process hierarchy, and step-level cross-process
links per spec.md FR-019–FR-022.

- [ ] T064 [P] [US1] Unit test process-code uniqueness and parent-cycle prevention in `tests/unit/process-hierarchy.test.ts` — write first, must fail
- [ ] T065 [US1] Implement `lib/domain/process-hierarchy.ts` per T064 — implement only after T064 fails
- [ ] T066 [US1] Extend `createProcess` with `code`/`parentProcessId`, add `updateProcess` Server Action in `app/actions/process.ts` (depends on T065)
- [ ] T067 [US1] Extend `saveProcessMap` to accept optional `linkedProcessId` per step (depends on T065)
- [ ] T068 [US1] Build Processes index UI showing main/sub-process tree with code badges in `app/(app)/workspaces/[workspaceId]/processes/page.tsx` (depends on T066)
- [ ] T069 [US1] Add cross-process link affordance to Process Map steps (badge showing target code, click-through to that Process's map) in `components/process-map/` (depends on T067, T028)

**Checkpoint**: User Story 1 fully functional and independently testable/demoable.

---

## Phase 4: User Story 2 - Build and Validate a RACI Matrix (Priority: P2)

**Goal**: Assign RACI codes per Role per Activity and block finalization until every Activity has
exactly one Accountable and at least one Responsible.

**Independent Test**: Take a process with 4+ activities and 3+ Roles, deliberately leave one
Activity without an Accountable, run validation, confirm exactly that gap is flagged
(quickstart.md Scenario 2).

### Tests for User Story 2

- [ ] T032 [P] [US2] Unit test RACI rules — missing Accountable, multiple Accountable, missing Responsible — in `tests/unit/raci-validation.test.ts` — write first, must fail
- [ ] T033 [P] [US2] Integration test `setRaciAssignment`/`validateRaciMatrix`/`finalizeRaciMatrix` in `tests/integration/raci.test.ts`

### Implementation for User Story 2

- [ ] T034 [US2] Implement `lib/domain/raci-validation.ts` per T032 — implement only after T032 fails
- [ ] T035 [US2] Implement `setRaciAssignment`, `validateRaciMatrix`, `finalizeRaciMatrix`, `reopenRaciMatrix` Server Actions in `app/actions/raci.ts` (depends on T034)
- [ ] T036 [US2] Build RACI grid on semantic `<table>` with TanStack Table in `components/raci-grid/`
- [ ] T037 [US2] Build RACI Matrix page with validation-issue banner and Finalize/Reopen actions in `app/(app)/workspaces/[workspaceId]/processes/[processId]/raci/page.tsx` (depends on T035, T036)
- [ ] T038 [US2] Add arrow-key cell navigation and grid ARIA semantics to the RACI grid per Constitution Principle IV (depends on T036)
- [ ] T039 [US2] E2E test: quickstart.md Scenario 2 in `tests/e2e/raci.spec.ts`

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Define and Query an Authority Matrix (Priority: P3)

**Goal**: Define Decision Types and threshold/co-approval rules; answer "who can approve X at
value Y" and flag gaps/conflicts.

**Independent Test**: Define one Decision Type with two threshold tiers including a co-approval
rule, query several values, confirm correct approver(s) or a correctly flagged gap/conflict
(quickstart.md Scenario 3).

### Tests for User Story 3

- [ ] T040 [P] [US3] Unit test threshold resolution, co-approval triggering, gap detection, conflict detection (including inclusive-boundary edge case) in `tests/unit/authority-resolution.test.ts` — write first, must fail
- [ ] T041 [P] [US3] Integration test `createApprovalRule`/`queryApprovers`/`validateAuthorityMatrix` in `tests/integration/authority.test.ts`

### Implementation for User Story 3

- [ ] T042 [US3] Implement `lib/domain/authority-resolution.ts` per T040 — implement only after T040 fails
- [ ] T043 [US3] Implement `createDecisionType`, `createApprovalRule`, `deleteApprovalRule`, `validateAuthorityMatrix`, `queryApprovers` Server Actions in `app/actions/authority.ts` (depends on T042)
- [ ] T044 [US3] Build Authority Matrix rule-builder grid in `components/authority-grid/`
- [ ] T045 [US3] Build Authority Matrix page with approver-query tool (value → approvers/gap) in `app/(app)/workspaces/[workspaceId]/authority/page.tsx` (depends on T043, T044)
- [ ] T046 [US3] E2E test: quickstart.md Scenario 3 in `tests/e2e/authority.spec.ts`

**Checkpoint**: User Stories 1-3 all independently functional — the three core matrix types exist.

---

## Phase 6: User Story 4 - Export for External Sharing (Priority: P4)

**Goal**: Export Process Map, RACI Matrix, and Authority Matrix as downloadable files, visibly
marked when not yet finalized.

**Independent Test**: Export a populated RACI matrix; downloaded file opens outside the app and
visually matches the on-screen matrix, including a not-final indicator if exported pre-finalization
(quickstart.md Scenario 4).

### Implementation for User Story 4

- [ ] T047 [P] [US4] Implement PDF renderers (Process Map, RACI, Authority) with `@react-pdf/renderer` in `lib/export/pdf/`
- [ ] T048 [P] [US4] Implement Excel renderers (RACI, Authority) with `exceljs` in `lib/export/xlsx.ts`
- [ ] T049 [US4] Implement route handlers `app/api/export/process-map/[id]/route.ts`, `app/api/export/raci/[id]/route.ts`, `app/api/export/authority/[id]/route.ts` (depends on T047, T048)
- [ ] T050 [US4] Wire export buttons into map/RACI/authority pages, opening a format-selection preview (PDF/Excel/PNG) with the Draft/unresolved-issue banner per FR-013 visible before download is confirmed (depends on T049)
- [ ] T051 [US4] E2E test: quickstart.md Scenario 4 in `tests/e2e/export.spec.ts`

**Checkpoint**: All three artifact types can be produced as shareable files.

---

## Phase 7: User Story 5 - Invite Teammates with Scoped Access (Priority: P5)

**Goal**: Workspace Admins invite members by email with an access level; access is enforced
server-side; a workspace always keeps at least one Admin.

**Independent Test**: Admin invites a second account as Editor; confirm Editor can edit but not
manage membership; confirm a non-invited account is denied access entirely (quickstart.md
Scenario 5).

### Tests for User Story 5

- [ ] T052 [P] [US5] Integration test `inviteMember`/`changeMemberAccessLevel`/`removeMember`, including `LAST_ADMIN` rejection (FR-016), in `tests/integration/membership.test.ts`

### Implementation for User Story 5

- [ ] T053 [US5] Implement `inviteMember`, `changeMemberAccessLevel`, `removeMember` Server Actions in `app/actions/membership.ts` per T052
- [ ] T054 [P] [US5] Implement invitation email sending via Resend in `lib/email/invitation.ts`
- [ ] T055 [US5] Implement `app/api/invitations/[token]/accept/route.ts` (depends on T053)
- [ ] T056 [US5] Build workspace Members management UI in `app/(app)/workspaces/[workspaceId]/members/page.tsx` (depends on T053, T054)
- [ ] T057 [US5] E2E test: quickstart.md Scenario 5 in `tests/e2e/membership.spec.ts`

**Checkpoint**: All five user stories independently functional — feature-complete for v1 scope.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates that span every story, per Constitution Principles IV and VI

- [ ] T058 [P] Automated accessibility scan (axe-core) across process-map, raci-grid, authority-grid components; fix violations
- [ ] T059 [P] Loading/empty/error states pass across all workspace pages
- [ ] T060 Run the full `quickstart.md` walkthrough manually end-to-end against a fresh seeded database
- [ ] T061 [P] Write `README.md` covering setup, environment variables, and `pnpm` scripts
- [ ] T062 Verify SC-002 (RACI validation feedback < 5s) and SC-003 (Authority query < 2s) against representative seeded data volumes
- [ ] T063 [P] Automated reliability test: 100 consecutive simulated edit-and-reload cycles against `saveProcessMap` confirming zero data loss (SC-007) in `tests/integration/autosave-reliability.test.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational; uses Activities created via US1's `createActivity` action, but is independently testable once a process/activities exist
- **User Story 3 (Phase 5)**: Depends on Foundational only (Decision Types/Roles, not Process/Activity) — fully independent of US1/US2
- **User Story 4 (Phase 6)**: Depends on Foundational + at least one of US1/US2/US3 existing to export (build after those, or stub with seed data)
- **User Story 5 (Phase 7)**: Depends on Foundational only — independent of US1-US4
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### Within Each User Story

- Business-rule unit tests (T021, T032, T040) MUST be written and FAIL before their
  corresponding `lib/domain/*` implementation (Constitution Principle III — non-negotiable for
  this project, not merely optional per the generic task-generation rule)
- Domain logic before Server Actions before UI
- Story complete and checkpoint-validated before considering it done

### Parallel Opportunities

- All Setup tasks marked [P] run in parallel (T002-T007)
- Within Foundational, T015, T016, T018, T020 marked [P] run in parallel once schema (T009-T014) lands
- Once Foundational completes, User Stories 1, 2, 3, and 5 can be staffed and built in parallel (US4 needs at least one prior story's data model to export against)
- Within each story, [P]-marked test and model/domain tasks run in parallel

---

## Parallel Example: User Story 2

```bash
# Tests (write first, in parallel):
Task: "Unit test RACI rules in tests/unit/raci-validation.test.ts"
Task: "Integration test RACI actions in tests/integration/raci.test.ts"

# After tests fail, implement:
Task: "Implement lib/domain/raci-validation.ts"
# then sequentially: Server Actions → grid component → page wiring → a11y pass
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup → Phase 2: Foundational → Phase 3: User Story 1
2. **STOP and VALIDATE**: run quickstart.md Scenario 1 manually and via T031
3. Demo: a consultant can stand up a workspace and produce a shareable process map — the
   smallest slice that proves the product's core value

### Incremental Delivery

1. Foundation ready → **US1 (P1)** → demo process mapping
2. **+ US2 (P2)** → demo validated RACI matrices
3. **+ US3 (P3)** → demo authority matrices and approval queries
4. **+ US4 (P4)** → demo client-shareable exports
5. **+ US5 (P5)** → demo team collaboration with scoped access
6. Phase 8 Polish → production-ready v1

### Parallel Team Strategy

Once Foundational (Phase 2) is complete, up to four people can work concurrently: US1, US2 (can
trail slightly behind US1 since it needs Activities), US3, and US5 have no cross-dependencies;
US4 should start once at least one of US1/US2/US3 has real data to export.

---

## Notes

- [P] tasks touch different files with no unmet dependencies
- [Story] labels (US1-US5) trace every task back to spec.md's prioritized user stories
- Commit after each task or logical group, per repository git conventions
- Verify each business-rule unit test fails before writing its implementation (T021→T023, T032→T034, T040→T042)
- Stop at any checkpoint to demo/validate that story independently before continuing
