# Data Model: Ethics & Whistleblower Case Register

## New enums

```prisma
enum EthicsChannel  { HOTLINE EMAIL IN_PERSON MANAGER_REFERRAL OTHER }
enum EthicsCategory { FRAUD BRIBERY_CORRUPTION HARASSMENT_DISCRIMINATION HEALTH_SAFETY CONFLICT_OF_INTEREST DATA_MISUSE OTHER }
enum EthicsSeverity { LOW MEDIUM HIGH CRITICAL }
enum EthicsStatus   { NEW TRIAGED UNDER_INVESTIGATION CLOSED }
enum EthicsOutcome  { SUBSTANTIATED PARTIALLY_SUBSTANTIATED UNSUBSTANTIATED REFERRED }
```

## Changed entity

`Workspace` gains `nextEthicsCaseNumber Int @default(1)`.

## New entities

```prisma
model EthicsCase {
  id                   String         @id @default(uuid())
  workspaceId          String
  number               Int
  receivedOn           DateTime
  channel              EthicsChannel
  category             EthicsCategory
  severity             EthicsSeverity
  description          String         @db.Text
  anonymous            Boolean
  reporterName         String?
  status               EthicsStatus   @default(NEW)
  investigatorPersonId String?
  investigatorName     String?
  outcome              EthicsOutcome?
  closingSummary       String?        @db.Text
  closedAt             DateTime?

  workspace    Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  investigator Person?          @relation(fields: [investigatorPersonId], references: [id], onDelete: SetNull)
  notes        EthicsCaseNote[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([workspaceId, number])
  @@map("ethics_cases")
}

model EthicsCaseNote {
  id           String   @id @default(uuid())
  caseId       String
  body         String   @db.Text
  authorUserId String

  ethicsCase EthicsCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  author     User       @relation(fields: [authorUserId], references: [id])

  createdAt DateTime @default(now())

  @@index([caseId])
  @@map("ethics_case_notes")
}
```

Additive migration (the new Workspace column has a default).

## Server actions (`lib/actions/ethics.ts`, NEW — all ADMIN)

`logEthicsCase`, `updateEthicsCaseStatus` (TRIAGED/UNDER_INVESTIGATION;
CLOSED requires outcome + summary and sets `closedAt`),
`assignEthicsInvestigator`, `addEthicsCaseNote`, `deleteEthicsCase` (NEW
only). No note edit/delete action exists.

## Domain (`lib/domain/ethics.ts`, NEW, pure)

`formatCaseReference(number)` → `CASE-0007`; `daysOpen`.
