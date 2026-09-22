# Implementation Plan: AI Governance Framework Generator

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-governance-generator/spec.md`

## Summary

The workspace's existing Governance page only summarises process data that already
exists (Key Control Points from the Authority Matrix, manual KPIs) — it doesn't cover
risk management, compliance, or data governance, which don't derive from a Process Map
at all. This feature adds an AI-assisted governance assessment: a consultant sets a
workspace's company size and jurisdiction (alongside its existing industry), picks one
focus area, and gets an executive summary framed against five governance pillars, a
phased checklist, and full draft policies for the checklist items that recommend one.
It reuses the product's one existing AI integration pattern (`generateStructured` in
`lib/ai/gemini.ts`) and the one existing persist-and-reconcile pattern
(`review-findings.ts`), rather than introducing new versions of either. **This round of
work stops at a mockup** — the requested deliverable — not working code.

## Technical Context

**Language/Version**: TypeScript 5, strict mode (for the eventual implementation)

**Primary Dependencies**: `@google/genai` (already in use, no new dependency),
Next.js 16.3 App Router, Prisma 7

**Storage**: Two new tables + two new optional `Workspace` columns (data-model.md) —
not migrated in this pass

**Testing**: Unit tests for `governance-findings.ts`'s reconciliation (mirroring
`review-findings.test.ts`'s coverage), e2e for the profile-required gate and the
generate → persist → mark-done → re-run cycle — written when implementation starts,
not in this mockup pass

**Target Platform**: Browser (workspace Governance page)

**Project Type**: Web application — Next.js App Router; AI/domain logic in `lib/ai/`
and `lib/domain/`, framework-free where the existing pattern already is

**Performance Goals**: N/A — one AI call per consultant action, same latency profile
AI Process Review already has

**Constraints**: Must not introduce a second AI integration pattern (Decision 1) or a
second reconciliation rule (Decision 3). Must not run without a governance profile set
(FR-003).

**Scale/Scope**: One new AI module, one new domain module, two new tables, one new
page section. Comparable in size to AI Process Review, which is the feature this one
is modeled on throughout.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| I. Type-Safe Full-Stack | Pass (for the eventual build). Same Zod-at-the-boundary, schema-inferred-types pattern every existing server action already uses; no new pattern needed. |
| II. Shared Domain Model | Pass, and the point of Decisions 1/3/4: governance profile lives on the `Workspace` that already carries `industry`, not a parallel entity; reconciliation reuses the existing module rather than forking it. |
| III. Test-First for Business Rules | Applies once implementation starts: the reconciliation rule (which checklist item survives a re-run) is exactly the kind of business rule Principle III means, and would get the same test-first treatment `review-findings.ts` already had. Not engaged in this mockup-only round. |
| IV. Accessible, Data-Dense UI | To be honored when the real page is built; the mockup itself is reviewed for it (keyboard order, contrast, semantic structure) before being taken as the design to implement. |
| V. Workspace Isolation & Least Privilege | Pass. Every new table is `workspaceId`-scoped (via the assessment), same as every other workspace-owned table; FR-009 sets EDITOR+ to generate, matching the write-vs-read split every other feature already uses. |
| VI. Simplicity & Incremental Delivery | Pass, explicitly: Decisions 1, 3 and 4 are each "reuse what exists" rather than "build a second version." The one new abstraction (the three-part assessment shape) is new only because nothing in the product already models "profile → AI-graded framework + phased actions + drafts," which does not exist elsewhere to reuse. |

No violations. Complexity Tracking table omitted.

## Project Structure

### Documentation (this feature)

```text
specs/012-governance-generator/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0
├── data-model.md        # Phase 1
└── checklists/
    └── requirements.md
```

No `contracts/`, `quickstart.md`, or `tasks.md` in this pass — those are written when
the mockup is approved and implementation begins.

### Source Code (for the eventual implementation — not created by this pass)

```text
lib/ai/governance-generator.ts        # SYSTEM_PROMPT + schema + runGovernanceAssessment,
                                       # mirroring lib/ai/process-review.ts exactly
lib/domain/governance-findings.ts     # reconciliation, thin wrapper over review-findings.ts
lib/actions/governance.ts             # setGovernanceProfile, generateGovernanceAssessment,
                                       # setChecklistItemStatus, updatePolicyDraft
app/(app)/workspaces/[workspaceId]/governance/
├── page.tsx                          # existing file, gains the new section
├── governance-profile-form.tsx       # NEW
├── governance-assessment-panel.tsx   # NEW — mirrors review-panel.tsx's shape
└── governance-policy-drawer.tsx      # NEW
```

## What this pass actually produces

A single interactive mockup (published as an Artifact, not committed to the repo) of:

1. The governance profile fields (company size, jurisdiction) sitting next to the
   workspace's existing industry.
2. Focus-area selection (the five areas from the spec).
3. An example assessment result — summary framed against the five pillars, a phased
   checklist, and an opened draft policy — using realistic content for one worked
   example, in the same visual language (`Governance, Controls & Metrics` header style,
   the existing page's card/section conventions) the rest of the workspace already
   uses, not a generic new design language.

No `tasks.md`, no code change, no migration. `speckit-tasks` and `speckit-implement`
follow once the mockup is reviewed and a direction is chosen — the same order this
session has followed for every other design decision (mockup → decision → SpecKit
build).
