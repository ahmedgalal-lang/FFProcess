# Tasks: Conflicts of Interest & Training Records

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1: Foundational

- [ ] T001 Add the enum, three models and back-relations; migrate, generate,
      restart the dev server.

## Phase 2: User Story 1 — conflicts (P1) 🎯 MVP

- [ ] T002 [US1] Write `tests/integration/people-governance.test.ts` for
      add/update/delete conflict (status + note, person from another
      workspace not-found, deleting the person deletes the conflict, VIEWER
      forbidden). Confirm they fail.
- [ ] T003 [US1] Implement the actions.
- [ ] T004 [US1] Build `governance-conflicts.tsx` (form, open/closed
      grouping, status select, mitigation note) and wire `page.tsx`.

## Phase 3: User Story 2 — training (P2)

- [ ] T005 [US2] Write `tests/unit/training.test.ts` (expiry date; Current,
      Expiring soon inside 30 days, Expired, No expiry) and integration
      tests for courses and completions (duplicate course name, cascade on
      course delete, ownership). Confirm they fail.
- [ ] T006 [US2] Implement; build `governance-training.tsx` (courses,
      completions with state, delete confirmation with count).
- [ ] T007 Write `tests/e2e/conflicts-and-training.spec.ts` for the quickstart.

## Phase 4: Polish

- [ ] T008 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
- [ ] T009 Blast-radius check via `git diff --stat`.
