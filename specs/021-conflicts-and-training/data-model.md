# Data Model: Conflicts of Interest & Training Records

## New enum

```prisma
enum ConflictStatus { DECLARED UNDER_REVIEW MITIGATED CLOSED }
```

## New entities

```prisma
model ConflictOfInterest {
  id             String         @id @default(uuid())
  workspaceId    String
  personId       String
  description    String         @db.Text
  relatedParty   String
  declaredOn     DateTime
  status         ConflictStatus @default(DECLARED)
  mitigationNote String?        @db.Text

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  person    Person    @relation(fields: [personId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([workspaceId])
  @@map("conflicts_of_interest")
}

model TrainingCourse {
  id             String @id @default(uuid())
  workspaceId    String
  name           String
  validityMonths Int?

  workspace   Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  completions TrainingCompletion[]

  createdAt DateTime @default(now())

  @@unique([workspaceId, name])
  @@map("training_courses")
}

model TrainingCompletion {
  id          String   @id @default(uuid())
  courseId    String
  personId    String
  completedOn DateTime

  course TrainingCourse @relation(fields: [courseId], references: [id], onDelete: Cascade)
  person Person         @relation(fields: [personId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@index([courseId])
  @@index([personId])
  @@map("training_completions")
}
```

Additive migration.

## Server actions (`lib/actions/people-governance.ts`, NEW — EDITOR writes)

`addConflict`, `updateConflict`, `deleteConflict`; `addTrainingCourse`
(duplicate name → validation error), `updateTrainingCourse`,
`deleteTrainingCourse`; `addTrainingCompletion`, `deleteTrainingCompletion`.
Person, course and conflict ids ownership-checked against the workspace.

## Domain (`lib/domain/training.ts`, NEW, pure)

`trainingExpiry(completedOn, validityMonths)`,
`trainingState(completedOn, validityMonths, today)`.
