# Quickstart: Delete Warning & Process Restore

How to prove the feature works end to end. Assumes the dev server and database are running
(`pnpm dev`) and the demo workspace is seeded (`SEED_DEMO_WORKSPACE=1 pnpm prisma db seed`).

## Run the automated checks

```bash
pnpm test                                   # domain unit tests
pnpm exec playwright test tests/e2e/process-restore.spec.ts tests/e2e/delete-warning.spec.ts
pnpm exec playwright test tests/e2e/viewer-read-only.spec.ts
```

The viewer spec is included because this feature adds two controls a viewer must never
see; the existing spec is extended rather than duplicated.

## Walk it by hand

**Restore (User Story 1)**

1. Open a workspace's Processes page as an editor. Note a process with steps, a RACI
   matrix and authority rules — the seeded `PUR101 · Purchase-to-Pay` has all three.
2. Open the process and note its step count, a RACI letter, and one authority sentence.
3. Go back, Delete it, confirm. It leaves the list.
4. Open the Export Report picker — it is not offered there either.
5. Follow the "Deleted processes" link on the Processes page. It is listed with its code,
   its name and today's date.
6. Restore it. It returns to the Processes list, and the deleted page no longer lists it.
7. Reopen the process: the step count, the RACI letter and the authority sentence are the
   ones from step 2.

**The warning (User Story 2)**

8. Trigger Delete on the same process and read the dialog without confirming. On the
   seeded data it reads: *Delete "PUR101 · Purchase-to-Pay"? It holds 9 steps, 17 RACI
   assignments and 14 authority rules, which will stop appearing in reports, exports and
   the value chain. Nothing is destroyed. You can bring this process back, exactly as it
   is now, from Deleted processes on the Processes page.*
9. Decline. The process is untouched.
10. Trigger Delete on a process with no steps — the dialog should say "This process is
    empty" rather than print zeroes. `PUR100` is empty on a fresh seed; note that other
    specs in the suite add a KPI to `PUR102`, which is why the automated spec creates its
    own empty process rather than borrowing a seeded one.

**References (User Story 3)**

11. Trigger Delete on `PUR100`, which has two sub-processes. The dialog adds an amber line:
    *2 sub-processes will be left without a parent.*
12. Confirm, then check the Processes list: the sub-processes are still there and still
    openable, now labelled "sub-process of PUR100 (deleted)" so the missing parent reads as
    deleted rather than as a misfiling.
13. Restore the parent. The sub-processes appear nested beneath it again.

**Access (FR-007, FR-008)**

14. Sign in as a viewer. The Processes page shows no Delete control and no "Deleted
    processes" link; navigating straight to `/workspaces/<id>/processes/deleted` does not
    show the list.

## Keyboard check (Principle IV)

15. Reach the Delete control by Tab alone and open it with Enter. Focus lands on **Cancel**,
    not on the red button — the dialog exists to give someone a chance to stop. Escape
    dismisses without deleting. Both buttons show a visible focus ring. Cancel is never
    disabled, including while the counts are still loading.
