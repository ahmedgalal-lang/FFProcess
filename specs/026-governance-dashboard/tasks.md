# Tasks: Governance Dashboard

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1: User Story 1 — core summary (P1) 🎯 MVP

- [ ] T001 [US1] Write `tests/unit/governance-dashboard.test.ts`: risks by
      level (Closed excluded), policies needing review, checklist progress;
      `isDashboardEmpty`; hrefs. Confirm they fail.
- [ ] T002 [US1] Implement `buildDashboardTiles` for the core inputs.
- [ ] T003 [US1] Build `governance-dashboard.tsx`, render it first in
      `page.tsx`, add section anchors, and the `riskLevel` all-aspects filter
      in the register.

## Phase 2: User Story 2 — the other registers (P2)

- [ ] T004 [US2] Extend the unit tests for incidents, vendors, conflicts,
      training, privacy, treatment and ethics tiles, including "no ethics
      input → no ethics tile". Confirm they fail.
- [ ] T005 [US2] Implement; feed each register's counts from `page.tsx`
      (ethics only for Admins).
- [ ] T006 Write `tests/e2e/governance-dashboard.spec.ts` for the quickstart.

## Phase 3: Polish

- [ ] T007 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
- [ ] T008 Blast-radius check via `git diff --stat`.
