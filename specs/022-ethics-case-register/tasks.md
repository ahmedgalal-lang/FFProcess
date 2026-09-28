# Tasks: Ethics & Whistleblower Case Register

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1: Foundational

- [ ] T001 Add the enums, two models, the Workspace counter and
      back-relations; migrate, generate, restart the dev server.

## Phase 2: User Story 1 — log and triage (P1) 🎯 MVP

- [ ] T002 [US1] Write `tests/unit/ethics.test.ts` (`formatCaseReference`,
      `daysOpen`) and `tests/integration/ethics.test.ts`: `logEthicsCase`
      numbers cases 1, 2, 3 and never reuses a number after deleting a New
      case; reporter name refused when anonymous; EDITOR and VIEWER are
      FORBIDDEN on every ethics action; another workspace's case is
      not-found. Confirm they fail.
- [ ] T003 [US1] Implement the domain helpers, `logEthicsCase`,
      `updateEthicsCaseStatus` (to TRIAGED) and `deleteEthicsCase` (NEW only).
- [ ] T004 [US1] Build `governance-ethics.tsx`; load cases in `page.tsx`
      only when the viewer is ADMIN.

## Phase 3: User Story 2 — investigate and close (P2)

- [ ] T005 [US2] Integration tests: investigator (person or free text, name
      kept after the person is removed); notes append in order; delete
      refused once triaged; closing requires outcome and summary and sets
      `closedAt`. Confirm they fail.
- [ ] T006 [US2] Implement; add investigator, notes and closing controls.
- [ ] T007 Write `tests/e2e/ethics-cases.spec.ts` for the quickstart,
      including the Editor seeing no register.

## Phase 4: Polish

- [ ] T008 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
- [ ] T009 Blast-radius check via `git diff --stat`; confirm no report,
      activity-log or export path reads ethics tables.
