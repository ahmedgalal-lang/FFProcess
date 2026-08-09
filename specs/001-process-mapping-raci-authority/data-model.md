# Phase 1 Data Model: Process Mapping, RACI & Authority Matrices

Entities below are derived from the spec's Key Entities section. All entities except `User`
and `Invitation` carry a `workspaceId` foreign key and every query is expected to filter by it
(Constitution Principle V). Field lists are conceptual (types are illustrative, not final Prisma
syntax) — exact column types/constraints are finalized during `/speckit-implement`.

## Workspace

The isolation boundary for all other data (FR-001).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | string | required |
| currency | string | ISO 4217 code, default per Assumptions (single currency per workspace) |
| createdAt / updatedAt | timestamp | |

Relationships: has many `Member`, `Role`, `Person`, `Process`, `DecisionType`.

## User

Account identity, workspace-independent (Auth.js managed).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| email | string | unique |
| name | string | |

Relationships: has many `Member` (one per Workspace they belong to).

## Member

A User's membership + access level within one Workspace (FR-014, FR-015).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspaceId | uuid | FK → Workspace |
| userId | uuid | FK → User (nullable until invitation accepted) |
| accessLevel | enum | `VIEWER` \| `EDITOR` \| `ADMIN` |
| invitedEmail | string | for pending invitations |
| status | enum | `PENDING` \| `ACTIVE` \| `REMOVED` |

Validation rules:
- Unique (`workspaceId`, `userId`) for active members.
- A Workspace MUST always retain at least one `Member` with `accessLevel = ADMIN` and
  `status = ACTIVE` (FR-016) — enforced on removal/downgrade, not just on read.

## Role

Named organizational function, reused across all three feature areas (FR-002).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspaceId | uuid | FK |
| name | string | required, unique within workspace |
| archivedAt | timestamp \| null | archive instead of hard-delete when referenced (FR-018) |

Relationships: many-to-many with `Person` (via `PersonRole`); referenced by `ProcessStep`,
`RaciAssignment`, `ApprovalRule`.

## Person

Named individual within a Workspace (FR-002).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspaceId | uuid | FK |
| name | string | required |
| email | string \| null | optional, for future invite-from-person convenience |
| archivedAt | timestamp \| null | archive instead of hard-delete when referenced (FR-018) |

Relationships: many-to-many with `Role` via `PersonRole`; referenced by `ApprovalRule` (a rule
may name a Person directly, not only a Role).

## PersonRole

Join table associating People with Roles.

| Field | Type | Notes |
|---|---|---|
| personId | uuid | FK, part of composite PK |
| roleId | uuid | FK, part of composite PK |

## Process

A named business process containing a Process Map and Activities (FR-003, FR-005), identified
by a unique code and optionally nested under a parent Process (FR-019, FR-020, FR-022).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspaceId | uuid | FK |
| code | string | required, unique within `workspaceId` (e.g. "SAL101") — case-insensitive uniqueness |
| name | string | required |
| description | string \| null | |
| parentProcessId | uuid \| null | FK → Process (self-referential; main/sub-process hierarchy, arbitrary depth) |
| createdAt / updatedAt | timestamp | `updatedAt` doubles as the optimistic-concurrency token for autosave (Research §6) |

Relationships: has many `ProcessStep`, `Activity`; has one `RaciMatrix` status summary (derived,
not a separate table — see RACI Matrix state below); self-referential `parentProcessId` → many
sub-`Process`es; referenced by other Processes' `ProcessStep.linkedProcessId` (cross-process links).

Validation rules (enforced in `lib/domain/process-hierarchy.ts`, unit-tested per Principle III):
- `code` MUST be unique within `workspaceId` (FR-022); create/rename is rejected with a reference
  to the conflicting Process otherwise.
- `parentProcessId` MUST NOT create a cycle — a Process cannot be its own ancestor, checked by
  walking the parent chain before save (FR-020, Edge Cases).
- A Process with one or more sub-processes, or that is the target of any `ProcessStep.linkedProcessId`,
  cannot be hard-deleted — it is archived instead, mirroring the Role/Person rule (FR-018 pattern).

## ProcessStep

A node in the Process Map (FR-003, FR-004).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| processId | uuid | FK |
| type | enum | `START` \| `TASK` \| `DECISION` \| `END` |
| label | string | |
| assignedRoleId | uuid \| null | FK → Role |
| swimlaneRoleId | uuid \| null | FK → Role, may differ conceptually from assignedRoleId but defaults to it |
| linkedProcessId | uuid \| null | FK → Process (a different Process than `processId`); optional cross-process hand-off (FR-021) |
| positionX / positionY | float | canvas layout coordinates |

## StepConnection

An edge between two `ProcessStep`s, optionally labeled (for decision branches).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| processId | uuid | FK (denormalized for workspace-scope query efficiency) |
| fromStepId | uuid | FK → ProcessStep |
| toStepId | uuid | FK → ProcessStep |
| label | string \| null | e.g. "Yes" / "No" on a decision branch |

Validation rules:
- Cycles are permitted (edge case: rework loops) — no acyclic constraint enforced.
- `fromStepId` and `toStepId` MUST belong to the same `processId`.

## Activity

A discrete unit of work within a Process; a row in its RACI Matrix (FR-005).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| processId | uuid | FK |
| name | string | required |
| relatedStepId | uuid \| null | FK → ProcessStep, optional link back to the map |
| order | int | display ordering |

## RaciAssignment

The RACI code linking one Activity to one Role (FR-005).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| activityId | uuid | FK |
| roleId | uuid | FK |
| code | enum | `RESPONSIBLE` \| `ACCOUNTABLE` \| `CONSULTED` \| `INFORMED` |

Validation rules (enforced in `lib/domain/raci-validation.ts`, unit-tested per Principle III):
- Unique (`activityId`, `roleId`) — one code per Role per Activity cell.
- Matrix-level validation (computed, not stored): every `Activity` MUST have exactly one
  `RaciAssignment` with `code = ACCOUNTABLE` and at least one with `code = RESPONSIBLE`
  (FR-006); violations block `RaciMatrixStatus` transition to `FINAL` (FR-007).

## RaciMatrixStatus

Tracks the Draft/Final lifecycle for a Process's RACI Matrix as a whole (FR-007).

| Field | Type | Notes |
|---|---|---|
| processId | uuid | PK, FK → Process (1:1) |
| status | enum | `DRAFT` \| `FINAL` |
| finalizedAt | timestamp \| null | |
| finalizedByMemberId | uuid \| null | FK → Member |

State transition: `DRAFT → FINAL` only permitted when zero unresolved validation issues exist
across all Activities in the Process (re-checked server-side at transition time, not just
client-side).

## DecisionType

A named category of decision/transaction requiring approval (FR-008).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workspaceId | uuid | FK |
| name | string | required |

## ApprovalRule

Links a Decision Type to an authorized Role or Person, a max threshold, and optional
co-approval requirement (FR-008, FR-009).

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| decisionTypeId | uuid | FK |
| approverRoleId | uuid \| null | FK → Role (exactly one of approverRoleId / approverPersonId set) |
| approverPersonId | uuid \| null | FK → Person |
| maxThreshold | decimal | inclusive upper bound of authority (Edge Cases: boundary inclusive) |
| coApprovalAboveThreshold | decimal \| null | if set, a second authorized approver required above this value |
| coApprovalRoleId | uuid \| null | FK → Role, the required co-approver when threshold exceeded |

Validation rules (enforced in `lib/domain/authority-resolution.ts`, unit-tested):
- Given a `(decisionTypeId, value)` query, resolution returns every rule whose
  `maxThreshold >= value`, selecting the tightest (lowest sufficient) threshold per
  approver-scope, plus any `coApproval` rule triggered (FR-010).
- A value range with no covering rule is flagged as a gap (FR-011).
- Two rules for the same `decisionTypeId` and overlapping approver-scope with ambiguous
  (non-strictly-ordered) thresholds are flagged as a conflict (FR-011).

## Entity Relationship Summary

```text
Workspace 1──* Member *──1 User
Workspace 1──* Role
Workspace 1──* Person *──* Role   (via PersonRole)
Workspace 1──* Process 1──* ProcessStep 1──* StepConnection
Process   *──1 Process        (parentProcessId — main/sub-process hierarchy)
ProcessStep *──1 Process      (linkedProcessId — cross-process step link)
Process   1──* Activity 1──* RaciAssignment *──1 Role
Process   1──1 RaciMatrixStatus
Workspace 1──* DecisionType 1──* ApprovalRule ──(Role | Person)
```
