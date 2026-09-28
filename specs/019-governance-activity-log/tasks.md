# Tasks: Governance Activity Log

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Scope is the 21 actions listed in data-model.md. Actions added to the
Governance area by later specs (027's treatment actions, 024's incidents,
etc.) are not part of this spec and would be a follow-up to extend the feed.

## Phase 1: Foundational

- [ ] T001 Add `GovernanceActivityEntityType`, `GovernanceActivityLogEntry`
      and the `Workspace`/`User` back-relations; migrate, generate, restart
      the dev server.
- [ ] T002 Add the private `logGovernanceActivity(client, params)` helper to
      `lib/actions/governance.ts`.

## Phase 2: User Story 1 — aspects and risks (P1) 🎯 MVP

- [ ] T003 [US1] Write `tests/integration/governance.test.ts` tests: each of
      the six aspect/risk actions writes exactly one entry with the right
      entity type, label, summary and actor; a deleted risk's entries still
      carry its label (FR-009); a VIEWER's refused call writes nothing
      (FR-010); `listGovernanceActivity` returns newest first, 50 per page,
      with a working cursor, VIEWER-readable. Confirm they fail.
- [ ] T004 [US1] Wire the six actions; implement `listGovernanceActivity`.
- [ ] T005 [US1] Build `governance-activity-log.tsx` (entries with actor,
      summary, type badge, time; Load more) and load the first page in
      `page.tsx`.

## Phase 3: User Story 2 — checklist items and assessments (P2)

- [ ] T006 [US2] Tests for the six checklist/assessment actions, including
      exactly one entry per generate/regenerate run with its counts, and a
      "no changes" run still logging one entry. Confirm they fail.
- [ ] T007 [US2] Wire them (regenerate inside its existing transaction).

## Phase 4: User Story 3 — policies (P3)

- [ ] T008 [US3] Tests for the ten policy actions. Confirm they fail.
- [ ] T009 [US3] Wire them (inside existing transactions where present).
- [ ] T010 Write `tests/e2e/governance-activity-log.spec.ts` (entries appear
      newest first; a deleted record's entry still reads by name; Load more).

## Phase 5: Polish

- [ ] T011 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
- [ ] T012 Blast-radius check; confirm ethics actions (spec 022) never log.
