# Quickstart: validating the governance generator

## Prerequisites

```bash
pnpm install
pnpm exec prisma migrate dev --name governance_generator   # schema additions in data-model.md
SEED_DEMO_WORKSPACE=1 pnpm db:seed
nohup pnpm dev > /tmp/dev.log 2>&1 &   # never `pkill -f "next dev"` — it kills the shell
```

`GEMINI_API_KEY` unset is a valid state to test in (FR-010) — the feature must say so
plainly rather than erroring; don't treat "no key configured" as a blocker to running
the rest of this checklist.

## 1. Reconciliation logic (fast, no browser, no AI call)

```bash
pnpm test tests/unit/governance-findings.test.ts
```

Extends `review-findings.test.ts`'s coverage to the two-dimensional case this feature
has and process review didn't: reconciliation scoped to (workspaceId, focusArea) for
checklist items, and separately for risks, which aren't focus-area-scoped at all
(FR-011). Asserts the specific guarantees SC-003/SC-004/SC-006 name: a done item stays
done, an edited policy is never overwritten, a hand-scored risk is never overwritten.

**Mutation check** — break each one at a time and confirm a test goes red:
- let a re-run reset a DONE checklist item back to OPEN
- let a re-run recreate a DISMISSED item
- let a re-run overwrite an EDITED policy's body
- let a re-run overwrite a hand-scored risk's likelihood/impact

## 2. The drawn result

```bash
pnpm test:e2e tests/e2e/governance-assessment.spec.ts
```

Sets a workspace's governance profile, runs an assessment for one focus area (with
`GEMINI_API_KEY` unset — the e2e suite doesn't call a live model any more than
AI Process Review's tests do), and asserts:
- FR-003: no profile set → the generate action is refused with a clear message, not a
  silent generic result
- FR-006: a checklist item's status survives a page reload
- The Risk Register and Policy Library sections render and are reachable without
  switching focus areas (SC-005)

## 3. Reconciliation, end to end

```bash
pnpm test:e2e tests/e2e/governance-assessment.spec.ts -g "reconcil"
```

Marks an item done, edits a policy, re-scores a risk by hand — then re-runs the same
fixture's assessment result through the action layer directly (bypassing the live model,
same pattern `ai-review.ts`'s own tests already use to test reconciliation without a
network call) and asserts none of the three were touched.

## 4. Access gating

```bash
pnpm test:e2e tests/e2e/viewer-read-only.spec.ts -g "governance"
```

A VIEWER can open the Governance page and read an existing assessment, Risk Register,
and Policy Library, but the generate/edit controls are absent — same pattern every
other EDITOR-gated feature's viewer test already follows.

## 5. Read it

Open `/workspaces/workspace-acme/governance`, run an assessment for Risk & Internal
Controls, and read the summary, checklist, risk register and policy library as a
consultant would. Compare against the approved mockup
(https://claude.ai/artifact/WwGMgev9B2EF5zHhoViFjC) for anything the automated checks
wouldn't catch — spacing, a status pill that reads ambiguously, a policy draft that's
hard to scan.
