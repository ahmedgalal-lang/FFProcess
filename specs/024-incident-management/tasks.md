# Tasks: Incident & Issue Management

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1: Foundational

- [ ] T001 Add the three enums, three models and back-relations; migrate,
      generate, restart the dev server.

## Phase 2: User Story 1 — log and resolve (P1) 🎯 MVP

- [ ] T002 [US1] Write `tests/unit/incidents.test.ts` for `sortIncidents`
      and `daysOpen`. Confirm they fail.
- [ ] T003 [US1] Write `tests/integration/incidents.test.ts` for
      `addIncident`, `updateIncident` (Resolved/Closed without a root cause
      refused; Closed sets `closedAt`, reopening clears it), `deleteIncident`,
      process ownership, VIEWER forbidden. Confirm they fail.
- [ ] T004 [US1] Implement the domain helpers and the three actions.
- [ ] T005 [US1] Build `governance-incidents.tsx` (log form, list with
      severity/status/days open, status select with root-cause field) and
      wire `page.tsx`.

## Phase 3: User Story 2 — corrective actions (P2)

- [ ] T006 [US2] Tests for `isIncidentActionOverdue` and the three action
      actions (both-owners rejected, ownership, done/undone, delete, cascade
      with the incident). Confirm they fail.
- [ ] T007 [US2] Implement them; add the actions list, overdue flags and the
      close-with-open-actions warning to the UI.

## Phase 4: User Story 3 — breach clock and risk links (P3)

- [ ] T008 [US3] Tests for `breachDeadline`/`breachNotificationState`
      (pending with hours remaining, overdue, notified, not required, N/A),
      `setIncidentBreach` (notified XOR not-required), and
      `linkIncidentRisk`/`unlinkIncidentRisk` (ownership; deleting either
      side removes only the link). Confirm they fail.
- [ ] T009 [US3] Implement them; add the breach controls, countdown and risk
      links to the UI.
- [ ] T010 Write `tests/e2e/incidents.spec.ts` for the quickstart.

## Phase 5: Polish

- [ ] T011 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
- [ ] T012 Blast-radius check via `git diff --stat`.
