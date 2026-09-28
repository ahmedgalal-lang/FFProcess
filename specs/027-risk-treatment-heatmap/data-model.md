# Data Model: Risk Treatment Plans & Heat Map

## New enum

```prisma
enum RiskTreatmentStrategy {
  MITIGATE
  TRANSFER
  ACCEPT
  AVOID
}
```

## Changed entity: `GovernanceRisk`

```prisma
  treatmentStrategy  RiskTreatmentStrategy?
  treatmentRationale String?         @db.Text
  targetLikelihood   RiskLikelihood?
  targetImpact       RiskImpact?
  treatmentActions   GovernanceRiskTreatmentAction[]
```

## New entity

```prisma
model GovernanceRiskTreatmentAction {
  id            String    @id @default(uuid())
  riskId        String
  description   String    @db.Text
  ownerRoleId   String?
  ownerPersonId String?
  dueDate       DateTime?
  doneAt        DateTime?

  risk        GovernanceRisk @relation(fields: [riskId], references: [id], onDelete: Cascade)
  ownerRole   Role?   @relation("TreatmentActionOwnerRole", fields: [ownerRoleId], references: [id], onDelete: SetNull)
  ownerPerson Person? @relation("TreatmentActionOwnerPerson", fields: [ownerPersonId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([riskId])
  @@map("governance_risk_treatment_actions")
}
```

Back-relations on `Role` and `Person`. Migration is additive.

## Server actions (`lib/actions/governance.ts`, all EDITOR, ownership-checked)

- `setRiskTreatment({ workspaceId, riskId, strategy, rationale, targetLikelihood, targetImpact })` — each nullable; sets `handManaged`.
- `addRiskTreatmentAction({ workspaceId, riskId, description, ownerRoleId?, ownerPersonId?, dueDate? })` — not both owners; owners must be in the workspace; sets the risk's `handManaged`.
- `setRiskTreatmentActionDone({ workspaceId, actionId, done })` — sets/clears `doneAt`.
- `deleteRiskTreatmentAction({ workspaceId, actionId })`.

## Domain (`lib/domain/risk-treatment.ts`, NEW, pure)

- `heatMapCells(risks)` → 12 cells `{ likelihood, impact, level, count, riskIds }`, Closed excluded.
- `isTreatmentActionOverdue(dueDate, doneAt, today)`.

## Client

- `RiskT` gains `treatmentStrategy`, `treatmentRationale`, `targetLikelihood`,
  `targetImpact`, `treatmentActions[]` (description, ownerLabel, dueDate,
  done, overdue), `hasOverdueTreatment`.
- `GovernanceRiskRegister` gains the heat map, a cell filter, a per-row
  expandable Treatment panel, and `roles`/`people` props for owner selects.
