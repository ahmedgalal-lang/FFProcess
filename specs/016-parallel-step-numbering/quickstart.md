# Quickstart: Parallel Step Numbering

## Prerequisites

Dev server running, Postgres up, signed in as an EDITOR on a workspace with
a process that has a step whose "requires all" rule (spec 015) is on with
two predecessors.

## Scenario 1 — a genuine parallel pair letters (User Story 1)

1. Build (or reuse) a process: Start → Legal sign-off → Countersign, and
   Start → Client sign-off → Countersign, with Countersign's rule set to
   "requires all."
2. Open the Steps List. Confirm Legal sign-off and Client sign-off read as
   "2a" and "2b" (or whatever position they start at), not "2" and "3."
3. Confirm the step after them (Countersign) reads as the very next whole
   number — the sequence isn't left with a gap.
4. Generate the printed report (both layouts). Confirm the same two steps
   read "2a"/"2b" there too, on their own cards.

## Scenario 2 — a real chain is never mislabeled (User Story 2)

1. Add a connection from Legal sign-off directly to Client sign-off (so one
   is now reachable from the other), leaving both still feeding
   Countersign.
2. Reopen the Steps List. Confirm both are back to ordinary whole numbers —
   lettering no longer applies, because a path exists between them.

## Scenario 3 — nothing changes for a process that never uses this (User Story 3)

1. Open any process that has never used "requires all," or one where a
   "requires all" step has only one predecessor.
2. Confirm the Steps List and both printed layouts show exactly the numbers
   they showed before this feature existed.

## Scenario 4 — turning the rule off reverses the lettering (Edge Cases / SC-003)

1. On Scenario 1's process, turn Countersign's "requires all" rule back off.
2. Confirm Legal sign-off and Client sign-off immediately return to
   ordinary, consecutive whole numbers — exactly what they'd have read
   before the rule was ever turned on.

## Automated verification

- `pnpm vitest run tests/unit/parallel-step-numbering.test.ts` — group
  detection and label assignment, mutation-checked.
- `pnpm vitest run tests/unit/print-map-layout.test.ts` — `numberLabel`
  threaded through `mergesFrom`/`BackReference`.
- `pnpm exec playwright test tests/e2e/parallel-step-numbering.spec.ts` —
  the four scenarios above, end-to-end.
