# Quickstart: Validating Process Ordering

How to prove the feature works end to end. Each section maps to one user story and can be run
on its own, so a partially implemented feature can still be validated as far as it goes.

## Prerequisites

```bash
service postgresql start
pnpm exec prisma migrate deploy
pnpm db:seed
pnpm dev
```

Sign in with the seeded Firm Owner (credentials in `tests/e2e/sign-in.ts`). The seeded
workspace `workspace-acme` has four processes — `PUR100`, `PUR101` (a sub-process of `PUR100`),
`PUR102`, `SAL101` — which is enough to exercise both levels of the tree.

## Story 1 — Arrange the library

1. Open `/workspaces/workspace-acme/processes`.
2. Confirm the list reads in the order it did before this feature (`code` ascending) — the
   backfill must make the first render after migration identical to the last one before it.
3. Move `SAL101` to the top using only the keyboard: tab to its move-up control and activate it
   repeatedly.
4. Reload. The new order persists.
5. Move `PUR100` (which has `PUR101` beneath it) down one. Its sub-process travels with it and
   stays indented beneath it.
6. Try to move the first process up. Nothing happens, and no error appears.

**Expected**: order survives reload, sub-process never separates from its parent, boundary
moves are silent no-ops.

## Story 2 — The library order reaches the pack

1. Open `/workspaces/workspace-acme/export`. The list is in the arranged order from Story 1,
   not `code` order.
2. Select all four processes and preview the report.
3. The "Processes in This Report" index lists them in that order, and the per-process sections
   that follow appear in the same order.
4. Download the PPTX from the same preview. Its per-process slides follow the same order.

**Expected**: one order across picker, report and deck, with no manual step between them.

## Story 3 — Arrange one pack without touching the library

1. On `/workspaces/workspace-acme/export`, select all four processes.
2. Move one process to a different position — an order deliberately different from the library.
3. Preview the report. It follows the pack's order.
4. Copy the report URL, open it in a new tab. Same order again — the sequence rides in the link.
5. Go back to `/workspaces/workspace-acme/processes`. **The library order is unchanged.**
6. Start a fresh export. It begins in library order, not the pack's.

**Expected**: a pack's arrangement affects that pack only, survives sharing, and never writes
back.

## Robustness checks

Hand-edit a report URL and confirm none of these produce an error page:

| Edit | Expected |
|------|----------|
| Remove one `ids` parameter | Report covers the remaining processes, in order |
| Add an `ids` for a process in another workspace | That id is ignored; the rest render |
| Add an `ids` for a deleted process | Ignored; the rest render |
| Reverse the `ids` sequence | Report order reverses to match |

## Automated checks

```bash
pnpm run lint
pnpm run build
pnpm exec vitest run          # ordering rules: comparator, move, next-position, pack order
pnpm exec playwright test     # the three stories, end to end
```

The ordering rules are business rules under Principle III, so their unit tests are written
before the implementation and must fail first. The `moveProcessInOrder` and `applyPackOrder`
edge cases (unknown id, boundary move, partial sequence) belong there rather than in an
end-to-end test.
