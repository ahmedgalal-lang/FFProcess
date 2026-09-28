# Quickstart: Policy Lifecycle

## Prerequisites

Dev server running, Postgres up, migration applied, signed in as an EDITOR
on one browser session and (for the Admin-only steps) able to act as an
Admin — the seeded `workspace-acme` demo workspace has at least one policy
already in its Policy Library from earlier governance work.

## Scenario 1 — draft to published, with version history (User Story 1)

1. Open a policy (from a checklist item, or a hand-written one). Confirm it
   reads "Draft."
2. Edit its body and save. Confirm a new version appears in its version
   history, and the previous text is still retrievable there.
3. As an Editor, submit it for review. Confirm it now reads "In Review."
   Edit it again and confirm it stays "In Review" (FR-008's reset rule only
   fires from Approved or Published, not from In Review).
4. As an Admin, approve it. Confirm it reads "Approved," with the approving
   person's name and the date shown.
5. As an Admin, publish it. Confirm it reads "Published," with an effective
   date (today by default).
6. Edit the published policy's body. Confirm it drops back to "Draft" and
   the Approved/Published-only controls (Retire, acknowledgement) disappear
   until it's re-approved and re-published.
7. Publish it again (repeat steps 3-5). As an Admin, retire it. Confirm it
   reads "Retired," is still fully readable with its complete history, and
   is not offered as an active policy elsewhere.

## Scenario 2 — regeneration never touches a policy that's left Draft (User Story 1, FR-010)

1. On a governance aspect with an assessment that recommended a policy,
   submit that policy for review and approve + publish it (Scenario 1,
   steps 3-5).
2. Regenerate the aspect's assessment.
3. Confirm the published policy's title, body, and lifecycle status are
   completely unchanged by the regenerate — it does not revert to Draft, get
   a new version, or get overwritten.

## Scenario 3 — flagging a policy overdue for review (User Story 2)

1. Publish a policy (Scenario 1). Set its review-due date to yesterday.
2. Open the Policy Library list view. Confirm this policy is visibly flagged
   as needing review.
3. Change its review-due date to next month. Confirm the flag disappears.
4. Confirm a Draft or In Review policy with a past review-due date is never
   flagged (the flag only applies to what's Published).

## Scenario 4 — acknowledgement tracking (User Story 3)

1. Publish a policy (Scenario 1). Open it and confirm an acknowledgement
   section appears, listing the workspace's People directory.
2. Mark two people as having acknowledged it, each with today's date shown.
3. Unmark one of them. Confirm it reverts to not-acknowledged and the
   record is gone (re-marking creates a fresh date, not the old one).
4. Retire the policy. Confirm the remaining acknowledgement is still there
   after retiring.
5. Open a Draft or In Review policy. Confirm no acknowledgement section is
   offered.

## Automated verification

- `pnpm vitest run tests/integration/governance.test.ts` — every new action
  (submit/approve/publish/retire, review-due date, mark/unmark
  acknowledgement), the version-history-on-every-save behavior, the
  reset-to-Draft-on-edit-while-Approved-or-Published rule, and the
  regeneration-never-touches-a-non-Draft-policy regression test
  (research.md Decision 3).
- `pnpm exec playwright test tests/e2e/policy-lifecycle.spec.ts` — the four
  scenarios above, end-to-end.
