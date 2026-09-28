# Tasks: Data Privacy Register

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1: Foundational

- [X] T001 Add the three enums, three models and back-relations; migrate,
      generate, restart the dev server. (Requires spec 024's schema.)

## Phase 2: User Story 1 — processing record (P1) 🎯 MVP

- [X] T002 [US1] Write `tests/integration/privacy.test.ts` for
      add/update/delete processing activity (all fields, owner and process
      ownership, both owners rejected, VIEWER forbidden). Confirm they fail.
- [X] T003 [US1] Implement the three actions.
- [X] T004 [US1] Build `governance-privacy.tsx` (activity form and list with
      special-category and transfer details) and wire `page.tsx`.

## Phase 3: User Story 2 — DPIAs (P2)

- [X] T005 [US2] Write `tests/unit/privacy.test.ts` for `isDpiaRecommended`
      and `needsPriorConsultation`, and integration tests for `addDpia`,
      `updateDpia` (editing an approved DPIA returns it to Draft),
      `approveDpia` (ADMIN only; EDITOR forbidden). Confirm they fail.
- [X] T006 [US2] Implement; add DPIA controls and flags to the UI.

## Phase 4: User Story 3 — breaches (P3)

- [X] T007 [US3] Integration tests for link/unlink (non-breach incident
      refused; another workspace's incident not-found; deleting either side
      removes only the link). Confirm they fail.
- [X] T008 [US3] Implement; list breach incidents with notification state
      and their links.
- [X] T009 Write `tests/e2e/privacy.spec.ts` for the quickstart.

## Phase 5: Polish

- [X] T010 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
- [X] T011 Blast-radius check via `git diff --stat`.
