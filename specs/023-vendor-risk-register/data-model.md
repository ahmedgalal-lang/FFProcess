# Data Model: Vendor & Third-Party Risk Register

## New enums

```prisma
enum VendorCriticality { LOW MEDIUM HIGH CRITICAL }
enum DueDiligenceStatus { NOT_STARTED IN_PROGRESS COMPLETED }
```

## New entities

```prisma
model Vendor {
  id                   String             @id @default(uuid())
  workspaceId          String
  name                 String
  service              String             @db.Text
  criticality          VendorCriticality
  ownerRoleId          String?
  ownerPersonId        String?
  dueDiligenceStatus   DueDiligenceStatus @default(NOT_STARTED)
  lastDueDiligenceOn   DateTime?
  reviewCycleMonths    Int?
  contractStartOn      DateTime?
  contractEndOn        DateTime?

  workspace   Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  ownerRole   Role?        @relation("VendorOwnerRole", fields: [ownerRoleId], references: [id], onDelete: SetNull)
  ownerPerson Person?      @relation("VendorOwnerPerson", fields: [ownerPersonId], references: [id], onDelete: SetNull)
  riskLinks   VendorRisk[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([workspaceId])
  @@map("vendors")
}

model VendorRisk {
  vendorId String
  riskId   String
  vendor   Vendor         @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  risk     GovernanceRisk @relation(fields: [riskId], references: [id], onDelete: Cascade)

  @@id([vendorId, riskId])
  @@map("vendor_risks")
}
```

Additive migration.

## Server actions (`lib/actions/vendors.ts`, NEW — EDITOR writes)

`addVendor`, `updateVendor`, `deleteVendor`, `linkVendorRisk`,
`unlinkVendorRisk`. Ownership checks on vendor, risk, role and person.

## Domain (`lib/domain/vendors.ts`, NEW, pure)

`nextDueDiligenceOn`, `isDueDiligenceOverdue`, `contractState` (`NONE |
ACTIVE | RENEWAL_SOON | EXPIRED`), `sortVendors` (Critical first, then name).
