# Quickstart: Governance Activity Log

## Prerequisites

Dev server running, Postgres up, migration applied, signed in as an EDITOR
(and, for a couple of policy steps, able to act as an Admin — the seeded
Firm Owner already covers both) on a workspace with at least one existing
aspect.

## Scenario 1 — aspects and risks show up in the feed (User Story 1)

1. Add a new aspect, rename it, then delete a different one. Add a risk by
   hand, edit its status, then delete it.
2. Open the Governance page's Activity section. Confirm six entries appear,
   most recent first, each naming what happened, the record's name, who did
   it, and when.
3. Confirm the entry for the deleted aspect and the deleted risk still read
   clearly, by name — not as a broken reference.

## Scenario 2 — checklist items and the assessment join the feed (User Story 2)

1. Add a checklist item by hand, then mark it Done. Edit an assessment's
   executive summary by hand.
2. Confirm three new entries appear for those three actions.
3. Regenerate an assessment that finds at least one new checklist item or
   risk (with a profile set, without `GEMINI_API_KEY`, generation is
   unavailable in this environment — verify this step against a workspace
   with a real AI key configured, or skip and rely on the automated
   integration test's mocked run). Confirm exactly one new entry appears for
   the whole run, naming how many new checklist items/risks it added — not
   one entry per item.

## Scenario 3 — every policy action joins the same feed (User Story 3)

1. Add a policy, submit it for review, approve it, publish it, set a
   review-due date, mark someone's acknowledgement, then retire it.
2. Confirm seven entries appear in the same feed as Scenarios 1-2 — not a
   separate list — each correctly describing its step.
3. Open the policy's own version history (from the earlier Policy Lifecycle
   feature). Confirm it's unchanged by this feature — the feed's entries are
   short one-liners, not a duplicate of that detailed record.

## Scenario 4 — pagination

1. Perform enough actions to exceed one page of the feed (the same actions
   from Scenarios 1-3, repeated, or however many the implementation's page
   size turns out to be).
2. Confirm the feed initially shows only the most recent page, with a "Load
   more" control, and that using it appends older entries without
   re-fetching or duplicating the ones already shown.

## Automated verification

- `pnpm vitest run tests/integration/governance.test.ts` — every mutating
  action asserted to also write exactly one matching
  `GovernanceActivityLogEntry`; `generateGovernanceAssessment`'s one-entry-
  per-run behavior (including the "no changes" case); a deleted record's
  entries still carry their captured label; a failed/rejected action (e.g.
  a VIEWER's forbidden call) writes no entry at all.
- `pnpm exec playwright test tests/e2e/governance-activity-log.spec.ts` —
  the feed rendering, ordering, and load-more behavior end-to-end.
