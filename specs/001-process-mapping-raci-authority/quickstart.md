# Quickstart: Validate Process Mapping, RACI & Authority Matrices

This guide proves the feature works end-to-end once implemented. It maps directly to the
spec's User Stories/Acceptance Scenarios — use it as the basis for the Playwright E2E specs
under `tests/e2e/`.

## Prerequisites

- Node.js 20 LTS, pnpm
- PostgreSQL 16 running locally (or `docker compose up db`, once added during implementation)
- `.env.local` with `DATABASE_URL`, `AUTH_SECRET`, and email-provider credentials for
  invitation sending (can point at a local test inbox / provider sandbox)

## Setup

```bash
pnpm install
pnpm prisma migrate dev        # applies prisma/migrations against DATABASE_URL
pnpm prisma db seed            # seeds a demo Workspace with sample Roles/People (implementation task)
pnpm dev                       # http://localhost:3000
```

## Scenario 1 — Map a process with the org behind it (User Story 1 / P1)

1. Sign in, create a Workspace named "Acme Client Engagement".
2. Under Org, add Roles "AP Clerk" and "Finance Manager"; add People "Priya" and "Sam" and
   assign each to a Role.
3. Create a Process "Purchase-to-Pay"; open its Process Map.
4. Add a Start step, three Task steps, a Decision step with two labeled branches, and an End
   step; connect them in sequence; assign the "AP Clerk" Role to two Task steps.
5. Group steps into swimlanes by Role.
6. Reload the page.

**Expected**: the map reloads with identical steps, connections, branch labels, Role
assignments, and swimlane grouping (validates FR-003, FR-004, FR-017; Acceptance Scenarios 1-5).

## Scenario 2 — Build and validate a RACI matrix (User Story 2 / P2)

1. From the Purchase-to-Pay process, add 4 Activities.
2. Open the RACI Matrix; assign RACI codes across the grid, but leave one Activity with no
   Accountable Role.
3. Run validation (or attempt "Mark Final").

**Expected**: finalization is blocked and the specific Activity is flagged as missing an
Accountable (FR-006, FR-007; Acceptance Scenarios 3-5). Fix the gap, re-validate, mark Final —
matrix now shows a "validated" status and further violating edits are prevented.

## Scenario 3 — Define and query an authority matrix (User Story 3 / P3)

1. Create Decision Type "Purchase Order".
2. Add rule: "AP Clerk" up to $10,000. Add rule: "Finance Manager" up to $100,000, with
   co-approval required above $50,000 (co-approver: "Finance Manager", i.e. a second
   Finance Manager sign-off).
3. Query approvers at $5,000, $60,000, and $250,000.

**Expected**: $5,000 → AP Clerk only; $60,000 → Finance Manager + required co-approval;
$250,000 → flagged as a gap (no rule covers it) (FR-008–FR-011; Acceptance Scenarios 1-4).

## Scenario 4 — Export (User Story 4 / P4)

1. Export the Process Map as PDF; export the RACI Matrix as PDF and as Excel while it is still
   in Draft status; export the finalized Authority Matrix as PDF.

**Expected**: all files download and open outside the app; the Draft RACI export visibly shows
its unresolved/not-final status (FR-012, FR-013; Acceptance Scenarios 1-4).

## Scenario 5 — Invite a teammate with scoped access (User Story 5 / P5)

1. As Admin, invite a second test account as Editor.
2. Accept the invitation with that account; confirm it can edit the RACI matrix but cannot
   reach workspace member management.
3. Attempt to access the workspace URL directly from a third, uninvited account.

**Expected**: the Editor account edits successfully but is blocked from admin-only actions
server-side (not just UI-hidden); the uninvited account is denied access with no data leakage
(FR-014, FR-015; Acceptance Scenarios 1-5).

4. As the seeded Firm Owner account, open the "All Clients" view and confirm the Acme Industrial
   workspace appears even though the Firm Owner holds no explicit `Member` record in it; open it
   and confirm editing succeeds.
5. As the second test account from step 1 (an ordinary Firm Member, not an Owner), attempt to
   open a different Workspace it was never invited to — confirm access is denied.

**Expected**: the Firm Owner reaches every Workspace via the carve-out without a fabricated
Member record; a non-Owner Firm Member gets no access beyond Workspaces it was explicitly added
to (FR-023–FR-026; Acceptance Scenarios 6-8).

## Automated coverage

- `tests/unit/raci-validation.test.ts` — exercises `lib/domain/raci-validation.ts` directly
  against the rule table in `contracts/server-actions.md` (`RaciIssue` types).
- `tests/unit/authority-resolution.test.ts` — exercises `lib/domain/authority-resolution.ts`
  against the Scenario 3 numbers above, plus the boundary-inclusive edge case (query exactly at
  a threshold value).
- `tests/e2e/core-workflows.spec.ts` — Playwright walkthrough of Scenarios 1–3 against a seeded
  test database.
- `tests/unit/workspace-access.test.ts` / `tests/unit/firm-ownership.test.ts` — exercise
  `requireWorkspaceAccess` and the last-Firm-Owner guard directly against Scenario 5's steps 4-5.
- `tests/e2e/firm-owner.spec.ts` — Playwright walkthrough of Scenario 5 steps 4-5.
