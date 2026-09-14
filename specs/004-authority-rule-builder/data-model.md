# Data Model: Authority Rule Builder

## New entity: AuthorityRule

One governance statement about one task. A task has zero or more, ordered.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String, pk | uuid |
| `assignmentId` | String, fk → AuthorityAssignment | cascade delete |
| `order` | Int, default 0 | position in the task's rule list; same pattern as `ProcessStep.order` |
| `measure` | enum `AuthorityMeasure` | `MONEY` \| `TIME` \| `NONE` |
| `amount` | Decimal(14,2)? | set only when `measure = MONEY` |
| `days` | Int? | set only when `measure = TIME` |
| `direction` | enum `AuthorityDirection` | unchanged enum, default `GREATER_THAN` |
| `consequence` | enum `AuthorityConsequence` | `APPROVAL` \| `ESCALATION` |
| `whoRoleId` | String? → Role | the role it lands on |
| `whoPersonId` | String? → Person | or the named person |
| `createdAt` / `updatedAt` | DateTime | tiebreak for `order` |

### New enums

```
enum AuthorityMeasure { MONEY TIME NONE }
enum AuthorityConsequence { APPROVAL ESCALATION }
```

`AuthorityMeasure.NONE` exists for one case: a rule whose direction is `EQUAL_NO_APPROVAL`
("no rule applies to this task"). It carries no figure and no consequence, and is what
keeps a row rendering dimmed after conversion.

### Rules about the rule

- `measure = MONEY` → `amount` required, `days` must be null.
- `measure = TIME` → `days` required, `amount` must be null.
- `measure = NONE` → both null, `direction = EQUAL_NO_APPROVAL`, consequence ignored.
- `whoRoleId` and `whoPersonId` are mutually exclusive; both null means an incomplete rule,
  which is reported by validation rather than rejected on save (a consultant may set the
  figure before deciding who signs).

These are enforced in the Zod schema at the server action boundary (Principle I), not only
in the database.

## Changed entity: AuthorityAssignment

Keeps its identity as the per-task record. Loses every rule-level field.

| Field | Change |
| --- | --- |
| `id`, `processId`, `activityId`, `stepId` | unchanged |
| `skipped` | unchanged — task-level, not rule-level |
| `rules` | **new** — `AuthorityRule[]` |
| `slaDays` | **removed** → becomes a `TIME` rule |
| `threshold` | **removed** → becomes a `MONEY` rule's `amount` |
| `direction` | **removed** → moves onto each rule |
| `approverRoleId`, `approverPersonId` | **removed** → become an `APPROVAL` rule's `who` |
| `coApprovalAboveThreshold`, `coApproverRoleId` | **removed** → become a *second* `APPROVAL` rule |
| `escalationRoleId` | **removed** → becomes an `ESCALATION` rule's `who` |

## Read model: AuthorityTableRow

Gains the rule list. Keeps its existing scalar fields as a **derived summary**, so the
consumers that only want one fact do not change.

```
AuthorityTableRow {
  id, kind, stepId, stepType, label, skipped   // unchanged
  rules: AuthorityRuleData[]                    // NEW — the whole list, in order

  // derived, for consumers that want a single answer:
  threshold        // first MONEY rule's amount, else null
  direction        // first MONEY rule's direction, else the first rule's, else GREATER_THAN
  slaDays          // first TIME rule's days, else null
  approverRoleId   // first APPROVAL rule's whoRoleId
  approverPersonId // first APPROVAL rule's whoPersonId
  escalationRoleId // first ESCALATION rule's whoRoleId

  // GONE:
  coApprovalAboveThreshold, coApproverRoleId
}
```

The derivation lives in one exported function so it cannot drift.

## Validation changes

`validateAuthorityTable` today emits `MISSING_APPROVER` and `MISSING_CO_APPROVER`. After:

| Issue | When |
| --- | --- |
| `MISSING_APPROVER` | a non-skipped task has no rules at all, and is not marked "no approval required" |
| `INCOMPLETE_RULE_WHO` | a rule has a consequence but neither a role nor a person |
| `INCOMPLETE_RULE_FIGURE` | a `MONEY` rule with no amount, or a `TIME` rule with no days |
| ~~`MISSING_CO_APPROVER`~~ | **removed** — there is no co-approver any more |

Issues carry the `ruleId` as well as the `rowId`, so the matrix can mark the specific rule.

## Migration

One migration, schema change plus backfill in the same file so there is never a window
where the rules table exists and is empty.

Backfill order per existing assignment — this order becomes the displayed order:

1. `threshold != null` → `MONEY` / `amount = threshold` / recorded `direction` / `APPROVAL`
   / who = approver.
2. `coApprovalAboveThreshold != null` → `MONEY` / `amount = coApprovalAboveThreshold` /
   `GREATER_THAN` / `APPROVAL` / who = co-approver.
3. `slaDays != null` → `TIME` / `days = slaDays` / `GREATER_THAN` / `ESCALATION` / who =
   escalation role.
4. `direction = EQUAL_NO_APPROVAL` → a single `NONE` rule carrying that direction, instead
   of 1–3.
5. none of the above → no rules; the parent row survives with its `skipped` flag.

Old columns are dropped in the same migration, after the backfill runs.

Re-running is a no-op: the backfill is guarded on the old columns still existing, and once
they are dropped there is nothing left to convert.
