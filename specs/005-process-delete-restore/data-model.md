# Data Model: Delete Warning & Process Restore

## No schema change

This feature adds no table, no column and no migration. It is built entirely on
`Process.archivedAt`, which already exists and is already set by `archiveProcess`.

| State | `archivedAt` | Where the process appears |
| --- | --- | --- |
| Live | `null` | Everywhere |
| Deleted | a timestamp | The deleted-processes page only |

Deleting sets the timestamp. Restoring clears it. There is no third state, and no other
field changes in either direction — which is what makes a restore exact rather than a
reconstruction.

## Read model: `DeletedProcessRow`

What the deleted-processes page lists. Derived; nothing new is stored.

```
DeletedProcessRow {
  id            // to restore it
  code          // e.g. "PUR101"
  name          // e.g. "Purchase-to-Pay"
  deletedAt     // the archivedAt timestamp, shown as a date
  stepCount     // so a consultant can tell two similar processes apart
  parentCode    // null when top-level, or when the parent is itself deleted
}
```

Ordered by `deletedAt` descending — the mistake a consultant is looking for is almost
always the last one they made.

## Read model: `ProcessDeleteImpact`

What the confirmation describes. Assembled on demand when the dialog opens; not stored.

```
ProcessDeleteImpact {
  code, name          // identifies the process being deleted

  // what goes with it
  stepCount           // ProcessStep rows
  raciAssignmentCount // RaciAssignment rows reached through this process's activities
  authorityRuleCount  // AuthorityRule rows reached through this process's assignments
  kpiCount            // length of the process's kpis array

  // what is left pointing at it
  subProcessCount     // live processes filed beneath this one
  branchingCount      // live processes that resume from one of this process's steps
}
```

`isEmpty` is the derived case where the first four counts are all zero — FR-015 requires
the confirmation to say "this process is empty" rather than print four zeroes.

### Where each count comes from

| Field | Query |
| --- | --- |
| `stepCount` | `_count.steps` |
| `raciAssignmentCount` | `RaciAssignment` where `activity.processId` is this process |
| `authorityRuleCount` | `AuthorityRule` where `assignment.processId` is this process |
| `kpiCount` | length of the `kpis` JSON array on the process row |
| `subProcessCount` | `Process` where `parentProcessId` is this process **and** `archivedAt` is null |
| `branchingCount` | `Process` where `branchFromStep.processId` is this process **and** `archivedAt` is null |

The last two filter on `archivedAt: null` deliberately. A sub-process that is itself
already deleted is not something the consultant is about to orphan, so counting it would
overstate the consequence.

## Derived state the feature must not disturb

Control points are computed from the combined RACI and authority rows at report time, not
stored. They therefore have no count of their own and need no restoring — they reappear
because their inputs do.
