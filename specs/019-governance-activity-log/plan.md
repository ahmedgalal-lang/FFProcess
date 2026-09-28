# Implementation Plan: Governance Activity Log

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-governance-activity-log/spec.md`

## Summary

Today only Policy carries any actor attribution (from spec 018's version
history and approval fields); an aspect, a risk, a checklist item, or an
assessment's own summary carry `createdAt`/`updatedAt` and nothing else —
no way to answer "who did this." This adds one new, append-only,
workspace-scoped table and a small helper every mutating governance action
calls on its own success path, producing one log entry per action (not per
row it touches), rendered as a single chronological feed on the Governance
page. `entityId` is deliberately a plain string, not a foreign key, so an
entry survives the record it describes being deleted. Tracing every
existing action confirmed the summary text has to be hand-written per call
site regardless of approach — so this stays 21 explicit, small edits to
`lib/actions/governance.ts` rather than a generic logging layer.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 App Router, React 19

**Primary Dependencies**: Prisma 7 (PostgreSQL) — one new enum, one new
table, two new back-relation arrays (`Workspace`, `User`); existing
`lib/actions/governance.ts`, extended with one private helper, one new
public read action, and one small addition to each of 21 existing actions.

**Storage**: PostgreSQL. One purely additive migration (research.md
Decision 7) — generated and applied by `prisma migrate dev` directly.

**Testing**: Vitest (integration — one assertion per action confirming its
matching log entry, the generate/regenerate one-entry-per-run behavior, the
survives-deletion guarantee, and the no-entry-on-failure guarantee),
Playwright (e2e — the four quickstart scenarios, including pagination).

**Target Platform**: Web (existing FFProcess app, workspace-scoped).

**Project Type**: Web application (single Next.js app).

**Performance Goals**: N/A — reads are a single indexed, cursor-paginated
query (`[workspaceId, createdAt]`); writes are one extra insert per action,
already inside that action's existing transaction where one exists.

**Constraints**: FR-009 (an entry survives its record's deletion) and
FR-010 (no entry for a failed action) are hard invariants, each covered by
its own test — not left as documentation-only guarantees.

**Scale/Scope**: Confined to `lib/actions/governance.ts` (21 small,
mechanical edits plus one helper and one new read action),
`prisma/schema.prisma`, `page.tsx`'s data loading, and one new client
component. No change to any existing component's own logic —
`governance-assessment-panel.tsx`, `governance-policy-drawer.tsx`,
`governance-policy-library.tsx`, `governance-risk-register.tsx`,
`lib/domain/governance-findings.ts`, and `lib/ai/governance-generator.ts`
are all untouched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Type-Safe Full-Stack**: `listGovernanceActivity`'s input is
  Zod-validated like every other action in this file; `entityType` is a
  Prisma-generated enum, not a hand-maintained string union. PASS.
- **II. Shared Domain Model**: No new entity concept is invented — an
  activity entry references the workspace and the acting user, both
  already-shared models; it doesn't duplicate anything `GovernancePolicyVersion`
  already tracks for policies specifically (research.md, spec.md both state
  this explicitly). PASS.
- **III. Test-First for Business Rules**: FR-009 (survives deletion),
  FR-010 (no entry on failure), and FR-005 (one entry per regenerate run,
  regardless of row count) are business rules with real, testable failure
  modes — tests written first for each. PASS.
- **IV. Accessible, Data-Dense UI**: The new feed reuses this page's
  existing list/badge patterns (the same style already used for the Risk
  Register and Policy Library rows) rather than introducing a new
  interaction pattern; "Load more" is an ordinary button, not an
  infinite-scroll trap that breaks keyboard/screen-reader use. PASS.
- **V. Workspace Isolation & Least Privilege**: `listGovernanceActivity`
  calls `requireWorkspaceAccess(workspaceId, "VIEWER")` like every other
  read in this file; every entry's `workspaceId` is set from the same
  already-authorized value the action it's attached to already validated —
  no new trust boundary is crossed. PASS.
- **VI. Simplicity & Incremental Delivery**: No generic logging
  middleware/extension (research.md Decision 2 — rejected as more complex
  for no benefit, since summaries must be hand-written regardless); no new
  `$transaction` introduced solely for logging where an action doesn't
  already have one (Decision 2); cursor pagination reuses Prisma's built-in
  `cursor`/`skip: 1`, no bespoke pagination library. PASS.

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/019-governance-activity-log/
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
├── schema.prisma                   # CHANGED — GovernanceActivityEntityType enum,
│                                    #   GovernanceActivityLogEntry model,
│                                    #   Workspace/User back-relations
└── migrations/<ts>_governance_activity_log/migration.sql   # NEW — generated, additive only

lib/
└── actions/
    └── governance.ts               # CHANGED — logGovernanceActivity helper,
                                     #   listGovernanceActivity action,
                                     #   one small addition to each of 21 existing actions

app/(app)/workspaces/[workspaceId]/governance/
├── page.tsx                         # CHANGED — loads the first activity page, passes it down
└── governance-activity-log.tsx      # NEW — the feed section, with its own "Load more"

tests/
├── integration/
│   └── governance.test.ts          # CHANGED — one assertion per action for its log entry,
│                                    #   plus dedicated tests for FR-005/FR-009/FR-010
└── e2e/
    └── governance-activity-log.spec.ts   # NEW — the four quickstart scenarios
```

**Structure Decision**: Single Next.js app — entirely within the existing
Governance feature area, following the same boundaries every governance
extension in this repo already uses. No new top-level directory, no new
page route — the feed is a new section on the existing Governance page.

## Complexity Tracking

*No violations — table intentionally empty.*
