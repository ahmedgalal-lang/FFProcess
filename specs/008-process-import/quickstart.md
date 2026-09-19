# Quickstart: Validating the Process Import

**Feature**: `specs/008-process-import`

How to prove this feature works end to end. Scenario numbers map to the spec's
Success Criteria.

## Prerequisites

```bash
pnpm install
pnpm exec prisma generate
pnpm dev            # http://localhost:3000
```

A workspace you hold `EDITOR` on, and a second sign-in holding only `VIEWER` for
scenario 5.

No migration. This feature adds no tables — see `data-model.md`, Part 2.

---

## Scenario 1 — The round trip (SC-001, FR-006)

The template, downloaded and uploaded untouched, must import. This is the standing
proof that the generator and the importer agree.

```bash
pnpm vitest run tests/unit/process-import-roundtrip.test.ts
```

Generates the workbook in memory, reads it back through the parser, and asserts zero
problems and a plan matching the worked example. **If this fails, the generator and
the importer have drifted and nothing else here is trustworthy.**

By hand: Processes page → **Download template** → upload it unedited → the summary
shows the example process → confirm → it opens complete.

---

## Scenario 2 — A filled-in process (SC-002, US1)

```bash
pnpm vitest run tests/unit/process-import.test.ts
```

By hand, with `tests/fixtures/process-import-sample.xlsx` (a 22-step process across
several roles, with connections, RACI and authority rules):

1. Processes page → **Import from a file** → choose the fixture.
2. The summary names the process, 22 steps, the connection count, which roles exist
   and which are new, and the RACI and authority counts.
3. Confirm.
4. **Process Map** — 22 steps in order, each in its role's lane, connections drawn,
   decision branches labelled.
5. **RACI Matrix** — populated, no validation warnings.
6. **Authority Matrix** — every rule with its figure, direction and who.
7. **Steps List** — detailed actions and "Risk if Mishandled" present.

Expected: nothing needed typing beyond the confirm.

---

## Scenario 3 — Mistakes create nothing (SC-003, SC-004, US2)

```bash
pnpm vitest run tests/unit/process-import-problems.test.ts
```

Covers, each asserting the sheet and row in the message: a connection naming a
missing step; two steps with one name; a task with two Accountables; a task with
none; a money rule with no figure; a rule with nobody to carry it; an unrecognised
step type; an empty template; a workbook that is not the template; a workbook
claiming an older format version.

End to end:

```bash
pnpm exec playwright test tests/e2e/process-import.spec.ts -g "rejects"
```

Uploads a deliberately broken file and asserts **the process count is unchanged** and
every problem is listed with its location. This is the assertion that matters: not
that an error appeared, but that nothing was created.

---

## Scenario 4 — Nothing survives a decline or a failure (FR-019, FR-020)

```bash
pnpm exec playwright test tests/e2e/process-import.spec.ts -g "leaves nothing"
```

Preview a valid file, decline, and assert no process, role or person was created.

For the transaction: `tests/unit/process-import-transaction.test.ts` forces a failure
part way through the write and asserts the database is exactly as it was — no
process, no orphaned roles, no half-written steps.

---

## Scenario 5 — Access (SC-007, US4)

```bash
pnpm exec playwright test tests/e2e/process-import-access.spec.ts
```

As a `VIEWER`:

1. The Processes page shows neither the download nor the upload control.
2. `GET /api/template/process-import/{workspaceId}` returns `403`.
3. Posting the import action directly is refused, and creates nothing.

The last two are the ones that count — the first only proves the page hid a button.

---

## Scenario 6 — Accessibility (Constitution Principle IV)

```bash
pnpm exec playwright test tests/e2e/process-import-a11y.spec.ts
```

The upload panel, the summary and the problem list are keyboard-reachable with
visible focus; problems are announced, not signalled by colour alone; axe reports no
violations.

---

## Scenario 7 — An imported process is an ordinary one (SC-005)

After scenario 2, on the imported process: edit a step, add a RACI letter, export the
RACI to `.xlsx` and the report to PDF, and run the AI review. Each behaves exactly as
on a hand-built process. A useful check is that a step carrying RACI grew its backing
`Activity` the same way a hand-built one does (research R4).

---

## Full suite

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm vitest run
pnpm exec playwright test
```
