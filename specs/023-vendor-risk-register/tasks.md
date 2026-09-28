# Tasks: Vendor & Third-Party Risk Register

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1: Foundational

- [X] T001 Add the enums, two models and back-relations; migrate, generate,
      restart the dev server.

## Phase 2: User Story 1 — register (P1) 🎯 MVP

- [X] T002 [US1] Write `tests/unit/vendors.test.ts` for `sortVendors` and
      integration tests for add/update/delete vendor (owner ownership, both
      owners rejected, VIEWER forbidden). Confirm they fail.
- [X] T003 [US1] Implement; build `governance-vendors.tsx`; wire `page.tsx`.

## Phase 3: User Story 2 — due diligence and renewals (P2)

- [X] T004 [US2] Unit tests for `nextDueDiligenceOn`,
      `isDueDiligenceOverdue`, `contractState`. Confirm they fail.
- [X] T005 [US2] Implement; show flags and the due-diligence/contract fields.

## Phase 4: User Story 3 — risk links (P3)

- [X] T006 [US3] Integration tests for link/unlink (ownership; deleting
      either side removes only the link). Confirm they fail.
- [X] T007 [US3] Implement; show links on the vendor and on the risk.
- [X] T008 Write `tests/e2e/vendors.spec.ts` for the quickstart.

## Phase 5: Polish

- [X] T009 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
- [X] T010 Blast-radius check via `git diff --stat`.
