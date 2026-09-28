# Data Model: Checklist Item Owners & Due Dates

## Changed entity: `GovernanceChecklistItem`

```prisma
model GovernanceChecklistItem {
  // ...existing fields unchanged...
  ownerRoleId   String?
  ownerPersonId String?
  dueDate       DateTime?

  ownerRole   Role?   @relation("ChecklistItemOwnerRole", fields: [ownerRoleId], references: [id], onDelete: SetNull)
  ownerPerson Person? @relation("ChecklistItemOwnerPerson", fields: [ownerPersonId], references: [id], onDelete: SetNull)
}
```

Back-relations: `Role.checklistItemsOwned`, `Person.checklistItemsOwned`.

## Migration

Purely additive (three nullable columns, two FKs) — `prisma migrate dev
--name checklist_owner_due_date`, no hand-authoring.

## Server action (`lib/actions/governance.ts`)

`updateGovernanceChecklistItem` gains optional `ownerRoleId`,
`ownerPersonId` (`string | null`) and `dueDate` (`YYYY-MM-DD | null`):
omitted = untouched, null = cleared; both owners set = validation error;
a named role/person must belong to the workspace, else not-found.

## Domain (`lib/domain/checklist-due.ts`, NEW)

`isChecklistItemOverdue(status, dueDate, today): boolean`.

## Client data flow

- `ChecklistItemT` gains `ownerRoleId`, `ownerPersonId`, `ownerLabel`,
  `dueDate` (`YYYY-MM-DD | null`), `overdue: boolean`.
- `GovernanceAssessmentPanel` gains a `roles` prop (page.tsx already loads
  roles). The edit form gets an Owner select and a Due date input; the row
  shows owner, due date and an Overdue badge; each aspect tab appends its
  overdue count when non-zero.
