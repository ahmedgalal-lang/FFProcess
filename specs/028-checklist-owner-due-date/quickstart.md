# Quickstart: Checklist Item Owners & Due Dates

1. On an aspect, add a checklist item by hand, click Edit, pick a role as
   owner and a due date next month, Save. The item shows both.
2. Edit it again, switch the owner to a person, set the due date to
   yesterday, Save. The item shows "Overdue", and the aspect's tab shows its
   overdue count.
3. Mark it Done. The Overdue badge and the tab count disappear.
4. Clear the owner and the due date. Both disappear from the item.

## Automated verification

- `pnpm vitest run tests/unit/checklist-due.test.ts tests/integration/governance.test.ts`
- `pnpm exec playwright test tests/e2e/checklist-owner-due-date.spec.ts`
