# Contracts: Server Actions

Server Actions are the primary interface between the UI and domain logic (Constitution
Principle I: Zod-validated at the boundary; Principle V: workspace/authorization re-derived
server-side inside every action, never trusted from the client payload). Signatures below are
conceptual — inputs are the Zod-inferred shape, outputs are `{ ok: true, data }` or
`{ ok: false, error }` discriminated unions unless noted.

Every action implicitly requires an authenticated session and re-derives the caller's effective
access to the target `workspaceId` server-side via `requireWorkspaceAccess()`, which resolves
access from either (a) an explicit `Member` record for that Workspace, or (b) the caller holding
`FirmMember.role = OWNER` (Constitution Principle V's Firm Owner carve-out) — whichever grants
sufficient access; actions annotated **[Editor+]** or **[Admin]** reject callers below that
effective access level (FR-015, FR-024, FR-025). A Firm Owner acting via carve-out (b) is
recorded as such, not as a fabricated `Member`.

## `app/actions/organization.ts`

| Action | Input | Output | Notes |
|---|---|---|---|
| `listAllWorkspaces` **[Firm Owner]** | `{}` | `Array<{ workspace: Workspace, accessVia: "MEMBER" \| "OWNER_CARVEOUT" }>` | every Workspace in the Firm, tagging how the caller can reach it (FR-024, FR-026 Acceptance Scenario 6) |
| `addFirmOwner` **[Firm Owner]** | `{ userId }` | `FirmMember` | promotes an existing Firm Member (or invites a new one) to Owner |
| `changeFirmMemberRole` **[Firm Owner]** | `{ firmMemberId, role }` | `FirmMember` or `{ ok: false, error: "LAST_OWNER" }` | enforces FR-026 |

## `app/actions/org.ts`

| Action | Input | Output | Notes |
|---|---|---|---|
| `createRole` **[Editor+]** | `{ workspaceId, name }` | `Role` | rejects duplicate name in workspace |
| `archiveRole` **[Editor+]** | `{ workspaceId, roleId }` | `Role` | soft-delete; blocked only if it would leave a referencing entity orphaned in a way validation can't represent — otherwise archives (FR-018) |
| `createPerson` **[Editor+]** | `{ workspaceId, name, email? }` | `Person` | |
| `archivePerson` **[Editor+]** | `{ workspaceId, personId }` | `Person` | see archiveRole notes |
| `setPersonRoles` **[Editor+]** | `{ workspaceId, personId, roleIds[] }` | `Person` (with roles) | replaces PersonRole set |

## `app/actions/process.ts`

| Action | Input | Output | Notes |
|---|---|---|---|
| `createProcess` **[Editor+]** | `{ workspaceId, code, name, description?, parentProcessId? }` | `Process` or `{ ok: false, error: "VALIDATION_ERROR" }` (duplicate code) | code uniqueness + parent-cycle checks (FR-020, FR-022) |
| `updateProcess` **[Editor+]** | `{ processId, expectedUpdatedAt, code?, name?, description?, parentProcessId? }` | `Process` or `{ ok: false, error: "CONFLICT" \| "VALIDATION_ERROR" }` | same validation as createProcess; rejects a `parentProcessId` that would create a cycle |
| `saveProcessMap` **[Editor+]** | `{ processId, expectedUpdatedAt, steps[] (each with optional `linkedProcessIds: string[]`), connections[] }` | `Process` (with steps/connections) or `{ ok: false, error: "CONFLICT" }` | optimistic concurrency per Research §6; full-graph replace-save (autosave payload); `linkedProcessIds` (zero or more) implements FR-021's many-to-many step-to-Process link via `ProcessStepLink` |
| `createActivity` **[Editor+]** | `{ processId, name, relatedStepId? }` | `Activity` | |
| `reorderActivities` **[Editor+]** | `{ processId, orderedActivityIds[] }` | `Activity[]` | |

## `app/actions/raci.ts`

| Action | Input | Output | Notes |
|---|---|---|---|
| `setRaciAssignment` **[Editor+]** | `{ activityId, roleId, code \| null }` | `RaciAssignment \| null` | `null` code clears the cell |
| `validateRaciMatrix` | `{ processId }` | `{ issues: RaciIssue[] }` | pure read; `RaciIssue` = `{ activityId, type: "MISSING_ACCOUNTABLE" \| "MULTIPLE_ACCOUNTABLE" \| "MISSING_RESPONSIBLE", roleIds?[] }` (FR-006) |
| `finalizeRaciMatrix` **[Editor+]** | `{ processId, expectedUpdatedAt }` | `RaciMatrixStatus` or `{ ok: false, error: "VALIDATION_FAILED", issues }` | re-runs validateRaciMatrix server-side before allowing `FINAL` (FR-007) |
| `reopenRaciMatrix` **[Editor+]** | `{ processId }` | `RaciMatrixStatus` | `FINAL → DRAFT` |

## `app/actions/authority.ts`

| Action | Input | Output | Notes |
|---|---|---|---|
| `createDecisionType` **[Editor+]** | `{ workspaceId, name }` | `DecisionType` | |
| `createApprovalRule` **[Editor+]** | `{ decisionTypeId, approverRoleId \| approverPersonId, maxThreshold, coApprovalAboveThreshold?, coApprovalRoleId? }` | `ApprovalRule` | |
| `deleteApprovalRule` **[Editor+]** | `{ ruleId }` | `void` | |
| `validateAuthorityMatrix` | `{ decisionTypeId }` | `{ issues: AuthorityIssue[] }` | `AuthorityIssue` = `{ type: "GAP" \| "CONFLICT", range/rules }` (FR-011) |
| `queryApprovers` | `{ decisionTypeId, value }` | `{ approvers: ApproverResult[], coApprovalRequired: ApproverResult \| null } \| { gap: true }` | resolves per Research §"authority resolution"; boundary values inclusive (FR-010, Edge Cases) |

## `app/actions/membership.ts`

| Action | Input | Output | Notes |
|---|---|---|---|
| `inviteMember` **[Admin]** | `{ workspaceId, email, accessLevel }` | `Member` (status PENDING) | triggers invitation email (route handler below) |
| `changeMemberAccessLevel` **[Admin]** | `{ workspaceId, memberId, accessLevel }` | `Member` or `{ ok: false, error: "LAST_ADMIN" }` | enforces FR-016 |
| `removeMember` **[Admin]** | `{ workspaceId, memberId }` | `void` or `{ ok: false, error: "LAST_ADMIN" }` | enforces FR-016 |

---

# Contracts: Route Handlers (`app/api/...`)

Route handlers are used only where a stable HTTP contract is required (file downloads, email
webhooks/callbacks, third-party auth callback) — everything else is a Server Action above.

| Route | Method | Auth | Request | Response | Notes |
|---|---|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | Auth.js managed | — | — | session/sign-in/sign-out/provider callback |
| `/api/export/process-map/[id]` | GET | session + workspace member (any level) | query `?format=pdf\|png` | file stream, `Content-Disposition: attachment` | FR-012; unresolved-validation banner baked into rendered output when applicable (FR-013 — process maps have no Draft/Final state, so this applies primarily to RACI/Authority below) |
| `/api/export/raci/[id]` | GET | session + workspace member | query `?format=pdf\|xlsx` | file stream | includes "Not Finalized" watermark/banner when `RaciMatrixStatus.status = DRAFT` (FR-013) |
| `/api/export/authority/[id]` | GET | session + workspace member | query `?format=pdf\|xlsx` | file stream | includes unresolved-issues banner when `validateAuthorityMatrix` returns issues (FR-013) |
| `/api/invitations/[token]/accept` | POST | session (new or existing account) | — | redirect to workspace | consumes a pending `Member` invitation, sets `status = ACTIVE` and binds `userId` |

## Error Shape (all contracts)

```ts
type ActionError =
  | { ok: false; error: "UNAUTHORIZED" }              // not a member of the workspace at all
  | { ok: false; error: "FORBIDDEN"; required: AccessLevel } // member, but access level too low
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "VALIDATION_ERROR"; issues: ZodIssue[] }
  | { ok: false; error: "CONFLICT" }                  // optimistic concurrency (autosave)
  | { ok: false; error: "LAST_ADMIN" }
  | { ok: false; error: "LAST_OWNER" }
  | { ok: false; error: "VALIDATION_FAILED"; issues: RaciIssue[] | AuthorityIssue[] };
```
