# Phase 0 Research: AI Governance Framework Generator

## Decision 1 — Reuse the existing structured-AI path, not a new integration

**Decision**: `lib/ai/governance-generator.ts` calls `generateStructured` from
`lib/ai/gemini.ts` — the same helper `process-review.ts` and `process-template.ts`
already share. The pasted system prompt becomes this feature's `SYSTEM_PROMPT`
constant, in the same place and same shape `process-review.ts`'s is.

**Rationale**: There is exactly one AI integration pattern in this codebase, used
twice already: one prompt in, one JSON object out, shaped by a fixed
`responseSchema`, gracefully absent when `GEMINI_API_KEY` isn't set. Building a
second pattern — a different SDK, a different error shape, a different
not-configured story — would be the "new capability that duplicates an existing
one" Principle VI exists to prevent, for no benefit: the shape of what's needed
(role + inputs → structured JSON) is identical.

**Alternatives considered**: The pasted prompt doesn't name a provider or model, so
there is no request in it to use anything other than what the product already runs
on.

## Decision 2 — Three schemas, not one, matching three independently-persisted things

**Decision**: The AI call returns one structured object with three top-level fields
— `summary` (string), `checklist` (array of items with a phase and an optional
policy reference), `policies` (array of full draft documents) — in a single
`generateStructured` call per run, the same "one call, one shaped object" pattern
`process-review.ts` uses for its `summary` + `findings` pair.

**Rationale**: The three outputs are generated together (a checklist item
recommending a policy needs the policy to exist) but persisted and edited
independently (FR-006, FR-007) — same relationship a `ReviewFinding`'s summary and
findings array already have. One call keeps the three outputs mutually consistent
(the checklist references policies the same run actually drafted); persisting them
as separate rows is what lets a checklist item be marked done without touching its
policy, and a policy be hand-edited without a re-run silently overwriting it.

## Decision 3 — Reconciliation reuses `review-findings.ts`'s rule verbatim

**Decision**: A new `lib/domain/governance-findings.ts` provides the same
`normalizeFindingTitle` / `partitionNew` shape as `review-findings.ts`, applied
per checklist item title within one (workspace, focus area) pair. A dismissed or
done item's normalized title is never recreated by a later run; a policy already
in `EDITED` status is never overwritten by a fresh generation for the same item.

**Rationale**: FR-007 and SC-003/SC-004 are, word for word, the rule
`review-findings.ts` already implements and already has tests for. Writing a
second version of "don't resurrect what was dismissed, don't duplicate what's
tracked" would be exactly the kind of drift the connector-routing work this
session found between `chooseHandles` and `chooseHandlesAt` — two copies of one
rule, destined to disagree. The existing module is generic over `{ title: string
}`, so it is reused directly rather than reimplemented, with a thin
workspace/focus-area-scoped wrapper for the extra dimension this feature has that
per-process review didn't need.

## Decision 4 — Governance Profile lives on Workspace, alongside the industry it already has

**Decision**: Two new optional `Workspace` columns, `governanceCompanySize` and
`governanceJurisdiction`, sitting next to the existing `industry` field. No new
table.

**Rationale**: `industry` already lives here and already means "the thing every
sector-aware feature in this product reads to ground its output" (used by AI
Process Review's own prompt today). The two new fields are the same kind of fact
about the same entity — set once per client, read by whichever feature needs
sector/size context — not something that needs its own table or its own
workspace-scoping logic to duplicate what `Workspace` already has.

## Decision 5 — Persistence shape, modeled directly on `ReviewFinding`

**Decision**: Two new tables. `GovernanceChecklistItem` (workspaceId, focusArea,
phase, title, description, status) mirrors `ReviewFinding`'s
id/title/description/status shape and status enum vocabulary
(OPEN/EDITED/DONE/DISMISSED — DONE replacing INTEGRATED, since there's no "step to
integrate into" here). `GovernancePolicyDraft` (checklistItemId, title, body,
status) holds the full document, one-to-one with the checklist item that
recommended it.

**Rationale**: Copying a working shape rather than designing a new one from
scratch is the same move Decision 3 makes for the logic; here it's the schema.
Every field earns its place by mapping to a functional requirement: `focusArea`
(FR-002, one focus area per run), `phase` (FR-004's three-way grouping), `status`
(FR-006/FR-007's independent, persisted tracking).

## Decision 6 — This is a mockup-first feature, per the request

**Decision**: This planning pass stops at the artifacts SpecKit produces before
`tasks.md`/`implement`. The deliverable for this round is a mockup — an
interactive page showing the profile form, the five-pillar framing, and example
output for all three deliverable types — not working code, migrations, or a live
Gemini call.

**Rationale**: Explicit in the request ("build the mockup"), and consistent with
how every other design decision this session went through a review mockup first
(edge routing, print density) before any implementation code was written. `plan.md`
and this file exist so the mockup is drawn from a real, checked design rather than
invented freehand — the mockup's copy, structure, and example content are what
`data-model.md` and this file describe, not a separate guess.
