# Tasks: Risk Treatment Plans & Heat Map

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1: Foundational

- [ ] T001 Add `RiskTreatmentStrategy`, the four `GovernanceRisk` columns,
      `GovernanceRiskTreatmentAction`, and back-relations on `Role`/`Person`;
      migrate, generate, restart the dev server.

## Phase 2: User Story 1 — heat map (P1) 🎯 MVP

- [ ] T002 [US1] Write `tests/unit/risk-treatment.test.ts` for
      `heatMapCells`: 12 cells; counts per likelihood × impact; Closed
      excluded; each cell's level matches `deriveRiskLevel`; `riskIds` lists
      exactly the counted risks. Confirm they fail.
- [ ] T003 [US1] Implement `heatMapCells` in `lib/domain/risk-treatment.ts`.
- [ ] T004 [US1] Render the heat map in `governance-risk-register.tsx`
      (table of `aria-pressed` buttons, text labels), filter the table by the
      selected cell with a Clear control, and add `aria-label`s to the
      register's existing selects.

## Phase 3: User Story 2 — treatment plans (P2)

- [ ] T005 [US2] Write `tests/unit/risk-treatment.test.ts` cases for
      `isTreatmentActionOverdue`, and `tests/integration/governance.test.ts`
      cases for the four actions: set/clear strategy, rationale, target;
      add an action with a role or person owner; both owners rejected;
      another workspace's risk/action/role/person is not-found; done sets and
      clears `doneAt`; delete; the risk becomes hand-managed; deleting a risk
      deletes its actions; removing a role unassigns its actions; VIEWER
      forbidden. Confirm they fail.
- [ ] T006 [US2] Implement `isTreatmentActionOverdue` and the four actions.
- [ ] T007 [US2] Wire `page.tsx` (treatment fields, actions with owner
      labels and overdue, `hasOverdueTreatment`, roles/people to the
      register) and the register's per-row Treatment panel and overdue flag.
- [ ] T008 Write `tests/e2e/risk-treatment-heatmap.spec.ts` for the quickstart.

## Phase 4: Polish

- [ ] T009 Lint, `tsc --noEmit`, full Vitest and Playwright suites
      (including the Governance page axe test with risks present).
- [ ] T010 Blast-radius check via `git diff --stat`.
