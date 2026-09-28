# Tasks: Checklist Item Owners & Due Dates

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1: Foundational

- [X] T001 Add `ownerRoleId`, `ownerPersonId`, `dueDate` and the two SetNull
      relations to `GovernanceChecklistItem`, with back-relations on `Role`
      and `Person`, in `prisma/schema.prisma`; migrate, generate, restart the
      dev server.

## Phase 2: User Story 1 — owner and due date (P1) 🎯 MVP

- [X] T002 [US1] Write `tests/integration/governance.test.ts` tests: setting
      a role owner and a due date; switching to a person owner; clearing both
      with null; omitting them leaves them untouched; naming both owners is a
      validation error; a role or person from another workspace is
      not-found; a VIEWER is forbidden; an archived role can't be newly
      assigned, but an owner archived after assignment stays and the item
      stays editable; a hard delete of the role clears the owner and keeps
      the item; a new item starts with neither; regenerating an
      assessment leaves an existing item's owner and date intact. Confirm
      they fail.
- [X] T003 [US1] Extend `updateGovernanceChecklistItem` in
      `lib/actions/governance.ts`.
- [X] T004 [US1] Extend `ChecklistItemT` and `page.tsx` (owner label, due
      date as `YYYY-MM-DD`, roles list passed to the panel).
- [X] T005 [US1] Add the Owner select and Due date input to the item edit
      form, and show owner and due date on the item row, in
      `governance-assessment-panel.tsx`.

## Phase 3: User Story 2 — overdue (P2)

- [X] T006 [US2] Write `tests/unit/checklist-due.test.ts` for
      `isChecklistItemOverdue`: past due and open → true; past due and DONE
      or DISMISSED → false; future or no date → false. Confirm they fail.
- [X] T007 [US2] Implement `lib/domain/checklist-due.ts`; compute `overdue`
      per item in `page.tsx`.
- [X] T008 [US2] Show an Overdue badge on overdue items, and append the
      overdue count to an aspect's tab name only when it's non-zero.
- [X] T009 Write `tests/e2e/checklist-owner-due-date.spec.ts` for the quickstart.

## Phase 4: Polish

- [X] T010 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
      Result: clean; 776/776 Vitest; 193/193 Playwright.
- [X] T011 Blast-radius check via `git diff --stat`.
      Result: schema + migration, `updateGovernanceChecklistItem`, the new
      `checklist-due.ts`, the Governance page and panel, and tests only.
