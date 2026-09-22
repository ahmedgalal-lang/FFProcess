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

## Two entities the first pass under-scoped

Walking the mockup past the user surfaced a real gap: "risk aspects" and "policies" each
need their own place, not just a spot inside one focus area's checklist.

### `GovernanceRisk` — a register, not a checklist item

A checklist item is a recommended *action*, closed by doing it. A risk is a standing
*fact about the business*, closed only when it's genuinely mitigated or accepted — it
needs its own lifecycle, its own likelihood/impact score, and to survive across
assessment runs the way a checklist item already does, independent of any one focus
area (a risk surfaced while assessing Risk & Controls is still a risk if the consultant
later regenerates Board Structure).

```prisma
enum RiskLikelihood { LOW MEDIUM HIGH }
enum RiskImpact { LOW MEDIUM HIGH CRITICAL }
enum RiskStatus { OPEN MITIGATING ACCEPTED CLOSED }

/// A tracked risk — from an assessment or added by hand (`sourceItemId` null).
/// Not scoped to one focus area: a risk found while assessing Risk & Controls
/// stays on the register even if Board Structure is regenerated next.
model GovernanceRisk {
  id          String          @id @default(uuid())
  workspaceId String
  title       String
  description String          @db.Text
  likelihood  RiskLikelihood
  impact      RiskImpact
  status      RiskStatus      @default(OPEN)
  ownerRoleId String?
  ownerPersonId String?

  /// The checklist item that surfaced this, when it came from a run rather
  /// than being added by hand. SetNull, not Cascade: the risk outlives the
  /// run that found it.
  sourceItemId String?

  workspace   Workspace                @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  sourceItem  GovernanceChecklistItem? @relation(fields: [sourceItemId], references: [id], onDelete: SetNull)
  ownerRole   Role?                    @relation(fields: [ownerRoleId], references: [id])
  ownerPerson Person?                  @relation(fields: [ownerPersonId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([workspaceId])
  @@map("governance_risks")
}
```

`level` (Low/Medium/High shown as a chip) is derived from likelihood × impact at read
time, the same way `deriveControlPoints` already derives the existing Governance page's
Key Control Points from the Authority Matrix rather than storing a redundant column —
one more place this feature follows a pattern already in the codebase instead of
inventing one.

**Reconciliation**: a risk surfaced by a run is matched by normalized title the same way
`review-findings.ts` already matches checklist items (Decision 3) — a re-run doesn't
duplicate a risk already on the register, and doesn't touch one a consultant has since
re-scored or reassigned by hand.

### Policy library — a view, not a new table

No new table: `GovernancePolicyDraft` already carries everything the library lists
(title, status, `updatedAt`) and already belongs to a checklist item, which belongs to
an assessment, which names its focus area — the library is
`GovernancePolicyDraft.findMany({ where: { checklistItem: { assessment: { workspaceId } } } })`,
ordered by `updatedAt`. Same relationship the existing workspace Governance page already
has to `AuthorityAssignment`: an aggregate read across an engagement's data, not a
second copy of it.

## What this feature reads from existing domain code, unchanged

- `lib/ai/gemini.ts` — `generateStructured`, `StructuredOutcome<T>`. No change.
- `lib/domain/review-findings.ts` — `normalizeFindingTitle`. Reused directly by the
  new `governance-findings.ts` rather than duplicated.
- `Workspace.industry` — already the sector-context field every other AI feature
  reads; this feature adds to it rather than replacing it.
