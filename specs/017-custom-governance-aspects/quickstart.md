# Quickstart: Custom Governance Aspects

## Prerequisites

Dev server running, Postgres up, migration applied, signed in as an EDITOR
on a workspace with at least one existing governance aspect carrying data
(an assessment, a risk, a policy — the seeded `workspace-acme` already has
this from earlier governance work this session).

## Scenario 1 — everything currently there survives the migration untouched (User Story, Edge Cases)

1. Before the migration: note the seven tab names and each tab's content
   (Executive summary, checklist, any risk/policy already sourced from
   one) on `workspace-acme`'s Governance page.
2. Apply the migration. Reload the page.
3. Confirm the same seven tabs, in the same order, each reading identically
   to step 1 — no missing risk, policy, checklist item, or summary.

## Scenario 2 — adding a client-specific aspect (User Story 1)

1. Click "+ Add aspect," name it something not already in use (e.g. "Data
   Privacy"). Confirm it appears as a new tab after the existing ones,
   reading empty.
2. On the new tab: generate an assessment (or add a checklist item, risk,
   and policy by hand if no model is configured in this environment).
   Confirm every action behaves exactly as it does on a built-in aspect.
3. Try adding another aspect with the exact name just used. Confirm it's
   rejected and the first one is untouched.

## Scenario 3 — renaming an aspect with real data on it (User Story 2)

1. Pick a tab with an assessment, a risk, and a policy already on it.
   Rename it.
2. Confirm the tab now reads under the new name, and the assessment, the
   risk (Risk Register), and the policy (Policy Library) are all still
   there, unchanged apart from the label they display.
3. Try renaming a different aspect to the name just vacated — confirm
   it's now allowed. Try renaming one to a name another aspect currently
   holds — confirm it's rejected.

## Scenario 4 — deleting an aspect without losing its risk or policy (User Story 3)

1. On the same tab from Scenario 3 (assessment + risk + policy already on
   it), delete the aspect.
2. Confirm its tab is gone, and confirm on the Risk Register and Policy
   Library (visible from whichever tab remains selected, or from a tab the
   item has no source on) that the risk and the policy are both still
   there, now reading "Added manually" rather than naming the deleted
   aspect.
3. Confirm the view has moved to a remaining aspect rather than showing a
   blank tab for the one just deleted.

## Automated verification

- `pnpm vitest run tests/integration/governance.test.ts` — every existing
  test rewired to create/use a real `GovernanceAspect` row instead of a
  fixed enum string; new tests for `addGovernanceAspect` /
  `renameGovernanceAspect` / `deleteGovernanceAspect`, including the
  policy-survives-detachment behavior (research.md Decision 2),
  mutation-checked.
- `pnpm exec playwright test tests/e2e/governance-aspects.spec.ts` — the
  four scenarios above, end-to-end.
