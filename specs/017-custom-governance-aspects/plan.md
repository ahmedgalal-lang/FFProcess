# Implementation Plan: Custom Governance Aspects

**Branch**: `017-custom-governance-aspects` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-custom-governance-aspects/spec.md`

## Summary

Today's seven governance "aspect" tabs (Board Structure, Risk & Internal
Controls, …) are a fixed Prisma enum, shared by every workspace in the
product. This turns them into real, per-workspace rows a consultant can
add, rename, and delete — with no distinction between the original seven
and a later addition. Deleting an aspect removes its own assessment
(summary + checklist) but never a risk or policy it had sourced; those
survive and become indistinguishable from a hand-added one, the same
survival guarantee this product already gives a risk when its source
assessment is regenerated. A hand-authored data migration seeds every
existing workspace's seven aspects and rewires its existing assessments to
point at them, so nothing changes in appearance the moment this ships.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 App Router, React 19

**Primary Dependencies**: Prisma 7 (PostgreSQL) — one new model, one
changed foreign key, one dropped enum; existing `lib/actions/governance.ts`
server actions, extended and three added.

**Storage**: PostgreSQL. One migration: new `governance_aspects` table,
`governance_assessments.aspectId` replacing `focusArea`, a hand-authored
data backfill (not something `prisma migrate dev` generates on its own —
see data-model.md), dropped `GovernanceFocusArea` enum.

**Testing**: Vitest (integration — every action, mutation-checked for the
delete-aspect policy-survival behavior specifically), Playwright (e2e — the
four quickstart scenarios).

**Target Platform**: Web (existing FFProcess app, workspace-scoped).

**Project Type**: Web application (single Next.js app).

**Performance Goals**: N/A — same request shapes as every other governance
action; the migration's backfill runs once, at deploy time, over a small
table (assessments), not a hot path.

**Constraints**: SC-002 — zero visible change to any existing workspace's
aspect list, or anything already tied to one, the moment this ships;
enforced by the migration's own backfill, not a runtime compatibility
shim.

**Scale/Scope**: One new Prisma model, one changed relation, one dropped
enum; changes confined to `lib/actions/governance.ts`, the Governance
page and its two client components (`governance-assessment-panel.tsx`,
`page.tsx`), and `lib/domain/governance-focus-areas.ts` (removed). No
change to `lib/domain/governance-findings.ts`, `lib/ai/governance-generator.ts`,
`governance-risk-register.tsx`'s or `governance-policy-library.tsx`'s own
CRUD (only what feeds their `sourceFocusArea`/`focusArea` fields changes,
not their shape).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Type-Safe Full-Stack**: Every action's new `aspectId` is
  Zod-validated (`z.string().min(1)`) like every other id in this file; no
  hand-maintained parallel type. PASS.
- **II. Shared Domain Model**: `GovernanceAspect` is workspace-scoped,
  exactly like every other entity this feature touches — no duplication,
  one row per aspect, referenced (not copied) by its assessment. PASS.
- **III. Test-First for Business Rules**: The delete-aspect
  policy-survives/risk-survives behavior (research.md Decision 2) is a
  business rule with a real, non-obvious failure mode (the schema's
  default cascade would silently delete a policy) — tests written first,
  mutation-checked. The migration's backfill correctness is verified
  directly against seeded data, not assumed. PASS.
- **IV. Accessible, Data-Dense UI**: The new add/rename/delete controls on
  the tab bar reuse the same accessible patterns (labeled inputs, confirm-
  before-delete) already on this same page for checklist items, risks, and
  policies — no new interaction pattern introduced. PASS.
- **V. Workspace Isolation & Least Privilege**: Every new/changed action
  ownership-checks `aspectId` against `workspaceId` exactly like every
  existing action in this file already does for `itemId`/`policyId`/
  `riskId`; EDITOR-gated throughout (FR-009). PASS.
- **VI. Simplicity & Incremental Delivery**: No reordering capability
  (Assumptions) — creation-time ordering is reused rather than adding an
  `order` column nobody asked for. No built-in/custom two-tier model
  (FR-006) — one table, one code path, not two. PASS.

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/017-custom-governance-aspects/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` — internal product feature, no external API; each action's
contract is its own Zod schema in `lib/actions/governance.ts`.

### Source Code (repository root)

```text
prisma/
├── schema.prisma                   # CHANGED — GovernanceAspect model, GovernanceAssessment.aspectId
└── migrations/<ts>_custom_governance_aspects/migration.sql   # NEW — hand-authored backfill

lib/
├── actions/
│   └── governance.ts               # CHANGED — aspectId throughout; 3 new actions
└── domain/
    └── governance-focus-areas.ts   # REMOVED — replaced by real rows

app/(app)/workspaces/[workspaceId]/governance/
├── page.tsx                         # CHANGED — queries GovernanceAspect, passes as prop
├── governance-assessment-panel.tsx  # CHANGED — dynamic tabs, add/rename/delete controls
├── governance-risk-register.tsx     # CHANGED — RiskT.sourceFocusArea now an aspect id (no shape change)
└── governance-policy-drawer.tsx     # CHANGED — PolicyT.focusArea now an aspect id (no shape change)

tests/
├── integration/
│   └── governance.test.ts          # CHANGED — every focusArea call site rewired to a real aspect id; new tests
├── unit/
│   └── governance-findings.test.ts # CHANGED — stale comment only, no behavior change
└── e2e/
    ├── governance-assessment.spec.ts  # CHANGED — rewired to seed a real aspect where a fixed one was assumed
    └── governance-aspects.spec.ts     # NEW — add/rename/delete + survival scenarios
```

**Structure Decision**: Single Next.js app — entirely within the existing
Governance feature area (spec 012) and its own action file, following the
same boundaries every governance extension this session already used.

## Complexity Tracking

*No violations — table intentionally empty.*
