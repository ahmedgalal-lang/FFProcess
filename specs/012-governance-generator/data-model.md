# Phase 1 Data Model: AI Governance Framework Generator

## Schema additions (for the eventual implementation; not migrated by this mockup pass)

```prisma
model Workspace {
  // ...existing fields...

  /// Set alongside `industry` to ground a governance assessment in the
  /// client's actual scale and legal context. Optional, like `industry` —
  /// the assessment refuses to run without them (FR-003) rather than the
  /// column itself being required, so an unrelated workspace edit never fails.
  governanceCompanySize   String?
  governanceJurisdiction  String?

  governanceAssessments GovernanceAssessment[]
}

enum GovernanceFocusArea {
  BOARD_STRUCTURE
  RISK_CONTROLS
  ETHICS_POLICY
  COMPENSATION
  ESG
}

enum GovernanceItemPhase {
  IMMEDIATE
  NEAR_TERM
  LONG_TERM
}

enum GovernanceItemStatus {
  OPEN
  EDITED
  DONE
  DISMISSED
}

/// One run, for one workspace and one focus area (FR-002). Re-running
/// replaces this row's summary text but reconciles its checklist items rather
/// than deleting and recreating them (FR-007) — see governance-findings.ts.
model GovernanceAssessment {
  id          String              @id @default(uuid())
  workspaceId String
  focusArea   GovernanceFocusArea

  /// The five-pillar-framed executive summary from the most recent run.
  summary String @db.Text

  workspace Workspace                  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  items     GovernanceChecklistItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([workspaceId, focusArea])
  @@map("governance_assessments")
}

model GovernanceChecklistItem {
  id           String              @id @default(uuid())
  assessmentId String
  phase        GovernanceItemPhase
  title        String
  description  String
  status       GovernanceItemStatus @default(OPEN)

  assessment GovernanceAssessment  @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  policy     GovernancePolicyDraft?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([assessmentId])
  @@map("governance_checklist_items")
}

/// One-to-one with the checklist item that recommended it (FR-005). Its own
/// status, separate from the item's: a consultant can mark the *item* done
/// while the *policy* stays a draft they're still editing, or vice versa.
model GovernancePolicyDraft {
  id              String                @id @default(uuid())
  checklistItemId String                @unique
  title           String
  body            String                @db.Text
  status          GovernanceItemStatus  @default(OPEN)

  checklistItem GovernanceChecklistItem @relation(fields: [checklistItemId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("governance_policy_drafts")
}
```

## The AI call's structured shape (Gemini `Schema`, mirroring `process-review.ts`)

```ts
type GovernanceAssessmentResult = {
  summary: string; // framed against the 5 pillars
  checklist: {
    phase: "immediate" | "near_term" | "long_term";
    title: string;
    description: string;
    policyTitle: string | null; // non-null when this item recommends a draft policy
  }[];
  policies: {
    title: string; // must match a checklist item's policyTitle
    body: string;  // the full draft document
  }[];
};
```

## What this feature reads from existing domain code, unchanged

- `lib/ai/gemini.ts` — `generateStructured`, `StructuredOutcome<T>`. No change.
- `lib/domain/review-findings.ts` — `normalizeFindingTitle`. Reused directly by the
  new `governance-findings.ts` rather than duplicated.
- `Workspace.industry` — already the sector-context field every other AI feature
  reads; this feature adds to it rather than replacing it.
