# Tasks: Governance & Risk in the Exported Report

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Tests first for the two business rules (pack ordering, view-model rules).

## Phase 1: Foundational — catalogue and ordering

- [X] T001 Write `tests/unit/report-arrangement.test.ts` tests: the default
      pack order includes `governance` between `chain` and `index`; a stored
      pack list predating `governance` resolves it between `chain` and
      `index` (not after `closing`), included; a stored list that moved
      `chain` last still gets `governance` right after `chain`; process
      sections keep the existing append-at-end behavior. Confirm they fail.
- [X] T002 Add the `governance` pack entry and the pack insertion rule in
      `lib/domain/report-arrangement.ts`. Confirm T001 passes.

## Phase 2: User Story 1 — Risk Register (P1) 🎯 MVP

- [X] T003 [US1] Write `tests/unit/governance-report.test.ts` for
      `buildGovernanceReport`: risks carry the derived level; not-Closed
      before Closed, then High → Low, then title; owner resolves to a role or
      person name, else null; `isGovernanceReportEmpty` true only when all
      three parts are empty. Confirm they fail.
- [X] T004 [US1] Implement `lib/domain/governance-report.ts`.
- [X] T005 [US1] Load governance rows workspace-wide in
      `lib/reports/load-report-data.ts` and add `governance` to `ReportData`.
- [X] T006 [US1] Render `GovernancePackSection` (Risk Register table with
      level, status, owner; specific empty message) in
      `app/reports/[workspaceId]/export-preview.tsx` for `case "governance"`.
- [X] T007 [US1] Add the governance slides to `lib/export/pptx/report-pptx.ts`
      (skipped entirely when empty; Risk Register table with `autoPage`).
- [X] T008 [US1] Write `tests/e2e/governance-report.spec.ts`: a hand-added
      risk appears in the printed report between Value Chain and the process
      index, and in the PPTX; unticking the section in the arrangement panel
      removes it from both.

## Phase 3: User Story 2 — Policy index (P2)

- [X] T009 [US2] Extend T003's tests: policies listed by title with
      lifecycle status and effective date (null unless set).
- [X] T010 [US2] Add policies to the view model, the HTML section and the deck.
- [X] T011 [US2] Extend the e2e: a published policy shows its status and
      effective date; no body text appears.

## Phase 4: User Story 3 — Assessment summaries (P3)

- [X] T012 [US3] Extend T003's tests: summaries in aspect order, labelled by
      aspect name, blank summaries skipped.
- [X] T013 [US3] Add summaries to the view model, the HTML section and the deck.
- [X] T014 [US3] Extend the e2e: a hand-written summary appears under its
      aspect's name.

## Phase 5: Polish

- [X] T015 Add "Governance & Risk" to `SECTION_TITLES` in
      `tests/e2e/report-composer.spec.ts` and update
      `tests/fixtures/report-default.snapshot.txt` with exactly that one
      intended line.
- [X] T016 Run lint, `tsc --noEmit`, the full Vitest suite and the full
      Playwright suite (including the pagination baselines); report counts.
      Result: lint and `tsc` clean; 762/762 Vitest (was 750); 192/192
      Playwright (was 190), pagination baselines and composer snapshot
      included. Run alone, the composer snapshot test fails on unrelated
      per-process KPI data, identically on the pre-feature commit; it
      passes in suite order.
- [X] T017 Blast-radius check via `git diff --stat`: no change to the
      Governance page, governance actions, or the schema.
      Result: confirmed — only the report pipeline (catalogue, loader, both
      renderers), the new view-model module, and tests.
