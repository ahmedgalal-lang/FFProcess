# Data Model: Incident & Issue Management

## New enums

```prisma
enum IncidentSeverity { LOW MEDIUM HIGH CRITICAL }
enum IncidentCategory { OPERATIONAL FINANCIAL IT_SECURITY HEALTH_SAFETY COMPLIANCE OTHER }
enum IncidentStatus   { OPEN INVESTIGATING RESOLVED CLOSED }
```

## New entities

```prisma
model GovernanceIncident {
  id          String           @id @default(uuid())
  workspaceId String
  title       String
  description String           @db.Text
  occurredAt  DateTime
  severity    IncidentSeverity
  category    IncidentCategory
  status      IncidentStatus   @default(OPEN)
  rootCause   String?          @db.Text
  closedAt    DateTime?
  processId   String?

  personalDataBreach            Boolean   @default(false)
  breachAwareAt                 DateTime?
  regulatorNotifiedAt           DateTime?
  notificationNotRequiredReason String?   @db.Text

  workspace Workspace                @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  process   Process?                 @relation(fields: [processId], references: [id], onDelete: SetNull)
  actions   GovernanceIncidentAction[]
  riskLinks GovernanceIncidentRisk[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([workspaceId])
  @@map("governance_incidents")
}

model GovernanceIncidentAction {
  id            String    @id @default(uuid())
  incidentId    String
  description   String    @db.Text
  ownerRoleId   String?
  ownerPersonId String?
  dueDate       DateTime?
  doneAt        DateTime?

  incident    GovernanceIncident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  ownerRole   Role?   @relation("IncidentActionOwnerRole", fields: [ownerRoleId], references: [id], onDelete: SetNull)
  ownerPerson Person? @relation("IncidentActionOwnerPerson", fields: [ownerPersonId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([incidentId])
  @@map("governance_incident_actions")
}

model GovernanceIncidentRisk {
  incidentId String
  riskId     String
  incident   GovernanceIncident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  risk       GovernanceRisk     @relation(fields: [riskId], references: [id], onDelete: Cascade)

  @@id([incidentId, riskId])
  @@map("governance_incident_risks")
}
```

Back-relations: `Workspace.governanceIncidents`, `Process.governanceIncidents`,
`GovernanceRisk.incidentLinks`, `Role`/`Person` action owners. Additive
migration.

## Server actions (`lib/actions/incidents.ts`, NEW — EDITOR writes)

`addIncident`, `updateIncident` (fields + status; Resolved/Closed require a
root cause; Closed sets `closedAt`, reopening clears it), `deleteIncident`,
`setIncidentBreach` (flag, awareness time, notified-at XOR not-required
reason), `addIncidentAction`, `setIncidentActionDone`,
`deleteIncidentAction`, `linkIncidentRisk`, `unlinkIncidentRisk`. All
ownership-checked (incident, action, risk, process, role, person).

## Domain (`lib/domain/incidents.ts`, NEW, pure)

See research.md Decision 6.
