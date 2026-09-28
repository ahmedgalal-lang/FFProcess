# Implementation Plan: Policy Lifecycle

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-policy-lifecycle/spec.md`

## Summary

Today a governance policy is a title, a body, and a single status enum
shared with checklist items — anyone with edit access can silently rewrite
it forever, with no review step, no history, and no way to know if it's
actually in force. This adds a second, independent lifecycle dimension
(Draft → In Review → Approved → Published, with Retired for one no longer
in force), a complete version history on every save, review-due-date
flagging, and lightweight acknowledgement tracking against the workspace's
People directory. Editing an Approved or Published policy resets it to
Draft, so "Approved" always means exactly what it says. Tracing the existing
regeneration path confirmed it already never touches an existing policy
once its checklist item's title is tracked — this feature adds a regression
test to pin that invariant, not a new runtime guard.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 App Router, React 19

**Primary Dependencies**: Prisma 7 (PostgreSQL) — one new enum, four new
columns on `GovernancePolicyDraft`, two new tables, two new back-relation
arrays (`User`, `Person`); existing `lib/actions/governance.ts`, extended
with 7 new actions and 3 changed ones.

**Storage**: PostgreSQL. One purely additive migration — no dropped or
retyped columns, no backfill decision needed (every new column is nullable
or has a safe default) — generated and applied by `prisma migrate dev`
directly (research.md Decision 7), unlike spec 017's hand-authored one.

**Testing**: Vitest (integration — every new action, the version-on-every-
save behavior, the reset-to-Draft rule, and the regeneration-safety
regression test), Playwright (e2e — the four quickstart scenarios).

**Target Platform**: Web (existing FFProcess app, workspace-scoped).

**Project Type**: Web application (single Next.js app).

**Performance Goals**: N/A — same request shapes as every other governance
action; version history is a small per-policy list, not a hot path.

**Constraints**: FR-008/FR-010 are hard invariants (an Approved/Published
policy's content always matches what was reviewed; a non-Draft policy is
never silently touched by regeneration), each covered by its own test, not
left as documentation-only guarantees.

**Scale/Scope**: Confined to `lib/actions/governance.ts`, the Policy Library
and Policy Drawer components, `prisma/schema.prisma`, and `page.tsx`'s data
loading for policies. No change to the Risk Register, the Governance
Assessment tab/checklist UI, `lib/ai/governance-generator.ts`, or
`lib/domain/governance-findings.ts` (research.md Decision 3 — its guard is
already sufficient by construction, so it is untouched).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Type-Safe Full-Stack**: Every new action's inputs are Zod-validated
  (`policyId`/`personId`: `z.string().min(1)`, `reviewDueDate`/
  `effectiveDate`: `z.string().date().nullable()` or equivalent), matching
  every existing action in this file — no hand-maintained parallel type.
  PASS.
- **II. Shared Domain Model**: Acknowledgement tracking reuses the existing,
  workspace-scoped `Person` directory (RACI/Authority's own) rather than
  inventing a separate "recipient" concept; version/approval attribution
  reuses the existing `User` model rather than inventing a separate "actor"
  concept. PASS.
- **III. Test-First for Business Rules**: FR-008 (reset-to-Draft on edit)
  and FR-010 (regeneration never touches a non-Draft policy) are real
  business rules with non-obvious failure modes if skipped — tests written
  first, and FR-010's specifically verified against the traced code path
  (research.md Decision 3) rather than assumed. PASS.
- **IV. Accessible, Data-Dense UI**: New lifecycle/review-due/acknowledgement
  controls reuse this page's existing accessible patterns (labeled inputs,
  confirm-before-destructive-action, contextual single-action buttons) —
  same bar already met by spec 017's aspect toolbar and this page's existing
  checklist-item/risk/policy controls. PASS.
- **V. Workspace Isolation & Least Privilege**: Every new action
  ownership-checks `policyId` (and, for acknowledgement, `personId`) against
  `workspaceId` exactly like every existing action in this file. Submit and
  review-due-date actions are EDITOR-gated; approve/publish/retire are
  ADMIN-gated (a new, deliberate distinction within this file, matching the
  precedent `updateWorkspaceProfile`/`updateWorkspaceBranding` already set
  for ADMIN-level actions elsewhere in the app). PASS.
- **VI. Simplicity & Incremental Delivery**: No notification/reminder system
  (Assumptions — explicitly deferred); no generic audit trail (research.md
  Decision 2 — scoped to policies only); no runtime guard added where the
  existing structure already provides the guarantee (research.md Decision
  3). PASS.

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/018-policy-lifecycle/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` — internal product feature, no external API; each action's
contract is its own Zod schema in `lib/actions/governance.ts`, same as
every prior governance spec in this repo.

### Source Code (repository root)

```text
prisma/
├── schema.prisma                   # CHANGED — GovernancePolicyLifecycleStatus enum,
│                                    #   GovernancePolicyDraft's 4 new columns,
│                                    #   GovernancePolicyVersion + GovernancePolicyAcknowledgement
│                                    #   models, User/Person back-relations
└── migrations/<ts>_policy_lifecycle/migration.sql   # NEW — generated, additive only

lib/
└── actions/
    └── governance.ts               # CHANGED — updatePolicyDraft/addGovernancePolicy/
                                     #   generateGovernanceAssessment's policy step version
                                     #   history + reset rule; 7 new actions

app/(app)/workspaces/[workspaceId]/governance/
├── page.tsx                         # CHANGED — loads people (already does, for RACI/Authority),
│                                     #   maps lifecycle fields + needsReview onto PolicyT
├── governance-policy-drawer.tsx     # CHANGED — lifecycle badge, action buttons,
│                                     #   review-due field, version history, acknowledgement list
└── governance-policy-library.tsx    # CHANGED — lifecycle badge + needs-review flag per row

tests/
├── integration/
│   └── governance.test.ts          # CHANGED — new describe block for the 7 new actions,
│                                    #   version-history assertions, reset-rule test,
│                                    #   FR-010 regression test
└── e2e/
    └── policy-lifecycle.spec.ts    # NEW — the four quickstart scenarios
```

**Structure Decision**: Single Next.js app — entirely within the existing
Governance feature area (spec 012) and its own action file, following the
same boundaries every governance extension in this repo already uses. No
new top-level directory, no new page route — this lives inside the existing
Policy Library/Drawer.

## Complexity Tracking

*No violations — table intentionally empty.*
