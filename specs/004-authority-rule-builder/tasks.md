# Tasks: Authority Rule Builder

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Data model**: [data-model.md](./data-model.md)

Tests are written first for every business rule, per Constitution Principle III. That
includes the migration backfill, whose rule is "no recorded value is lost".

---

## Phase 1: Setup

- [ ] T001 Add `AuthorityMeasure` (`MONEY`/`TIME`/`NONE`) and `AuthorityConsequence` (`APPROVAL`/`ESCALATION`) enums and the `AuthorityRule` model to `prisma/schema.prisma`, and remove the seven rule-level fields from `AuthorityAssignment` per data-model.md
- [ ] T002 Run `pnpm prisma generate` and confirm `app/generated/prisma` exposes the new model and enums

---

## Phase 2: Foundational — the read model (blocks every user story)

Pure domain work, no database. Every consumer below depends on this shape.

- [ ] T003 [P] Write failing unit tests for `deriveRowSummary` in `tests/unit/authority-table.test.ts` — first money rule wins for threshold/direction, first time rule for slaDays, first approval rule for approver, first escalation rule for escalation owner, empty list yields nulls
- [ ] T004 [P] Write failing unit tests for `describeAuthorityRule` in `tests/unit/authority-table.test.ts` covering all five sentence shapes in contracts/authority-rules.md (money+approval, money+no-who, time+escalation, time+approval, NONE)
- [ ] T005 [P] Write failing unit tests for `describeAuthorityRow` in `tests/unit/authority-table.test.ts` — returns one sentence per rule in order, `[]` for a task with no rules
- [ ] T006 [P] Write failing unit tests for the new `validateAuthorityTable` in `tests/unit/authority-table.test.ts` — `MISSING_APPROVER` for a non-skipped ruleless task, `INCOMPLETE_RULE_WHO`, `INCOMPLETE_RULE_FIGURE`, no issue for a skipped task or a `NONE` rule, and `MISSING_CO_APPROVER` gone
- [ ] T007 Add `AuthorityRuleData` and the `rules` field to `AuthorityTableRow` in `lib/domain/authority-table.ts`, and remove `coApprovalAboveThreshold` / `coApproverRoleId` from the type
- [ ] T008 Implement `deriveRowSummary` in `lib/domain/authority-table.ts` so T003 passes
- [ ] T009 Rewrite `describeAuthorityRule` to describe one rule, and add `describeAuthorityRow`, in `lib/domain/authority-table.ts` so T004 and T005 pass
- [ ] T010 Rewrite `validateAuthorityTable` and the `AuthorityIssue` union in `lib/domain/authority-table.ts` so T006 passes
- [ ] T011 Update `buildAuthorityTableRows` in `lib/domain/authority-table.ts` to carry `rules` and call `deriveRowSummary`, keeping its signature
- [ ] T012 Confirm `gateLine` in `lib/domain/authority-table.ts` is unchanged and still fed by the derived `threshold`/`direction`

**Checkpoint**: `pnpm test` green; the domain describes rules and nothing reads the database yet.

---

## Phase 3: User Story 3 — Existing matrices survive (Priority: P1) 🎯 MVP

Sequenced first of the three P1 stories because every other story writes to a schema that
does not exist until this lands, and because losing a client's recorded threshold is the
most expensive failure available.

**Goal**: every value in every existing Authority Matrix is still readable afterwards.

**Independent test**: seed a matrix holding every combination the old shape allowed, migrate, assert each converts per data-model.md, then migrate again and assert nothing changes.

- [ ] T013 Write a failing fixture test in `tests/unit/authority-migration.test.ts` asserting the five conversion cases in data-model.md against a set of old-shape assignment records (amount only; amount+co-approval; amount+sla+escalation; EQUAL_NO_APPROVAL; wholly empty)
- [ ] T014 Generate the schema SQL non-interactively: `pnpm prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script` into `prisma/migrations/<ts>_authority_rules/migration.sql`
- [ ] T015 Hand-append the backfill SQL to that same migration file, in the order given in data-model.md, so the schema change and the backfill land atomically; drop the seven old columns only after the backfill
- [ ] T016 Apply with `pnpm prisma migrate deploy` against a database holding the seeded PUR101 data and verify against the table in quickstart.md §1
- [ ] T017 Re-run `pnpm prisma migrate deploy` and confirm a clean no-op (FR-019)
- [ ] T018 Update `prisma/seed.ts` to create `AuthorityRule` rows directly instead of the removed fields, keeping the demo data equivalent

**Checkpoint**: real data converts and is verified in the database; the old columns are gone.

---

## Phase 4: User Story 1 — Build a rule in three moves (Priority: P1)

**Goal**: a consultant builds a rule by choosing money or time, a figure, a direction, and what happens then.

**Independent test**: add a money rule to a task, confirm only the currency input shows, the sentence reads correctly, and it survives a reload.

- [ ] T019 Write failing unit tests in `tests/unit/authority-actions.test.ts` for the Zod invariants in contracts/authority-rules.md — MONEY requires amount and rejects days, TIME the reverse, NONE rejects both, who-role and who-person mutually exclusive, switching measure clears the other figure
- [ ] T020 Replace the per-field actions in `lib/actions/authority.ts` with `addAuthorityRule`, `updateAuthorityRule` and `deleteAuthorityRule`, each requiring `EDITOR` and validating with Zod so T019 passes
- [ ] T021 Keep `setAuthoritySkipped` in `lib/actions/authority.ts` working against the parent `AuthorityAssignment`, creating it on demand
- [ ] T022 Include `rules` (ordered by `order` then `createdAt`) in the assignment query in `app/(app)/workspaces/[workspaceId]/processes/[processId]/authority/page.tsx`
- [ ] T023 Build the measure control in `authority/authority-table.tsx` — two `aria-pressed` buttons in a named `role="group"`, swapping the currency field for the days field (FR-001, FR-002, FR-003)
- [ ] T024 Build the consequence control and the who-picker in `authority/authority-table.tsx` — two `aria-pressed` buttons plus the existing role/person picker (FR-005, FR-006)
- [ ] T025 Rename the column header to `Then` and drop the `SLA`, `Amount`, `Approval`, `Co-approval` and `Escalation` headers in `authority/authority-table.tsx` (FR-008)
- [ ] T026 Render each rule's sentence under its rule in `authority/authority-table.tsx`, updating as the rule is edited (FR-007)
- [ ] T027 Keep the dimmed rendering for a `NONE` rule in `authority/authority-table.tsx` (FR-004)
- [ ] T028 Write an e2e test in `tests/e2e/authority-rules.spec.ts` for User Story 1's five acceptance scenarios, including the reload

**Checkpoint**: one rule per task can be built, read and reloaded.

---

## Phase 5: User Story 2 — Several rules per task (Priority: P1)

**Goal**: a task carries as many rules as it needs; this is what replaces co-approval.

**Independent test**: add a money approval rule and a time escalation rule to one task, edit one, delete the other, and confirm independence.

- [ ] T029 Add the "add another approval" control per task in `authority/authority-table.tsx` (FR-010)
- [ ] T030 Add a delete control per rule in `authority/authority-table.tsx` (FR-011)
- [ ] T031 Render a task with no rules as an empty state that still offers the add control in `authority/authority-table.tsx` (FR-009, edge case)
- [ ] T032 Assign `order = max(order) + 1` on create in `lib/actions/authority.ts` and read rules in that order everywhere (FR-013)
- [ ] T033 Write an e2e test in `tests/e2e/authority-rules.spec.ts` for User Story 2's four acceptance scenarios, including that editing one rule leaves the others untouched

**Checkpoint**: co-approval is fully replaced; a task can hold a limit and a deadline as separate rules.

---

## Phase 6: User Story 4 — The rules reach every document (Priority: P2)

**Goal**: report, deck and spreadsheet show every rule, in order, agreeing with the screen.

**Independent test**: build a two-rule task, export all three, confirm both rules appear in each in the same order.

- [ ] T034 Replace the single rule sentence with the ordered sentence list in `lib/reports/load-report-data.ts` (FR-023)
- [ ] T035 [P] Print every rule sentence under a task in `app/reports/[workspaceId]/export-preview.tsx` (FR-023)
- [ ] T036 [P] Print every rule sentence in `lib/export/pptx/report-pptx.ts` (FR-024)
- [ ] T037 [P] Emit one spreadsheet row per rule in `lib/export/xlsx.ts`, repeating the task (FR-025)
- [ ] T038 [P] Print every rule in `lib/export/pdf/authority-pdf.tsx` (FR-025)
- [ ] T039 Update `app/api/export/authority/[processId]/route.ts` for the new shape
- [ ] T040 Write an e2e test in `tests/e2e/authority-rules.spec.ts` asserting a two-rule task appears in full in the report preview, the PPTX XML and the spreadsheet
- [ ] T041 Verify the Process Map decision node still shows its gate figure, on the live canvas and in a generated PDF (FR-026)

**Checkpoint**: the pack agrees with the screen.

---

## Phase 7: Polish & cross-cutting

- [ ] T042 Sweep the remaining `coApprov*` references — `lib/domain/process-report.ts`, `lib/domain/process-review.ts`, `lib/domain/step-authority-summary.ts`, `lib/actions/ai-review.ts` — until `grep -rn "coApprov" lib/ app/ --include=*.ts --include=*.tsx` is empty outside `app/generated`
- [ ] T043 Check `lib/domain/step-readiness.ts` and `app/(app)/workspaces/[workspaceId]/governance/page.tsx` (Key Control Points) still read correctly from the derived summary
- [ ] T044 Extend the Viewer gating to every new control in `authority/authority-table.tsx`, keeping all rules and figures visible, and add the assertions to `tests/e2e/viewer-read-only.spec.ts` (FR-027)
- [ ] T045 Confirm the two toggle groups are keyboard-operable and add no axe violation — `npx playwright test tests/e2e/accessibility.spec.ts` (Principle IV, SC-006)
- [ ] T046 Walk quickstart.md end to end against a real database and a real generated PDF and PPTX
- [ ] T047 Full gate: `pnpm lint && pnpm test && pnpm build && npx playwright test`

---

## Dependencies

```
Phase 1 (T001–T002)
   └─> Phase 2 read model (T003–T012)
          └─> Phase 3 / US3 migration (T013–T018)   ← MVP, must land first
                 ├─> Phase 4 / US1 build a rule (T019–T028)
                 │      └─> Phase 5 / US2 several rules (T029–T033)
                 └─> Phase 6 / US4 documents (T034–T041)
                        └─> Phase 7 polish (T042–T047)
```

Phase 6 depends on Phase 3 (the schema) but not on Phases 4–5, so the export work can run
alongside the UI work once the migration has landed.

## Parallel opportunities

- **T003–T006** — four independent test files' worth of cases, all in the same file but
  non-overlapping; write together, then implement T008–T010 against them.
- **T035–T038** — four separate export surfaces, four separate files, no shared state.

## Implementation strategy

**MVP is Phase 3**, not Phase 4. The migration converting real client data without loss is
the piece that must be right; the rule builder on top of it is replaceable, the lost
threshold is not. Land Phases 1–3, verify against a real database, and only then build the
UI.

Stopping after Phase 5 would already deliver everything the user asked for on screen;
Phase 6 is what stops the exported pack disagreeing with it, so it ships in the same
release.
