# Data Model: Data Privacy Register

## New enums

```prisma
enum LawfulBasis { CONSENT CONTRACT LEGAL_OBLIGATION VITAL_INTERESTS PUBLIC_TASK LEGITIMATE_INTERESTS }
enum DpiaStatus  { DRAFT APPROVED }
enum DpiaResidualRisk { LOW MEDIUM HIGH }
```

## New entities

```prisma
model ProcessingActivity {
  id                     String      @id @default(uuid())
  workspaceId            String
  name                   String
  purpose                String      @db.Text
  lawfulBasis            LawfulBasis
  dataSubjectCategories  String[]
  personalDataCategories String[]
  recipients             String[]
  retentionPeriod        String
  specialCategory        Boolean     @default(false)
  transferDestination    String?
  transferSafeguard      String?
  processId              String?
  ownerRoleId            String?
  ownerPersonId          String?

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  process     Process?  @relation(fields: [processId], references: [id], onDelete: SetNull)
  ownerRole   Role?     @relation("ProcessingOwnerRole", fields: [ownerRoleId], references: [id], onDelete: SetNull)
  ownerPerson Person?   @relation("ProcessingOwnerPerson", fields: [ownerPersonId], references: [id], onDelete: SetNull)
  dpias       Dpia[]
  breachLinks ProcessingBreachLink[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([workspaceId])
  @@map("processing_activities")
}

model Dpia {
  id               String           @id @default(uuid())
  activityId       String
  risksIdentified  String           @db.Text
  mitigations      String           @db.Text
  residualRisk     DpiaResidualRisk
  status           DpiaStatus       @default(DRAFT)
  approvedByUserId String?
  approvedAt       DateTime?

  activity       ProcessingActivity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  approvedByUser User?              @relation("DpiaApprover", fields: [approvedByUserId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([activityId])
  @@map("dpias")
}

model ProcessingBreachLink {
  activityId String
  incidentId String
  activity   ProcessingActivity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  incident   GovernanceIncident @relation(fields: [incidentId], references: [id], onDelete: Cascade)

  @@id([activityId, incidentId])
  @@map("processing_breach_links")
}
```

Additive migration. Editing a DPIA's content after approval returns it to
DRAFT and clears the approval (the same invariant spec 018 applies to
policies).

## Server actions (`lib/actions/privacy.ts`, NEW)

`addProcessingActivity`, `updateProcessingActivity`,
`deleteProcessingActivity` (EDITOR); `addDpia`, `updateDpia` (EDITOR);
`approveDpia` (ADMIN); `linkBreachToActivity`, `unlinkBreachFromActivity`
(EDITOR; the incident must be flagged as a breach).

## Domain (`lib/domain/privacy.ts`, NEW, pure)

`isDpiaRecommended(activity)`, `needsPriorConsultation(dpia)`.
