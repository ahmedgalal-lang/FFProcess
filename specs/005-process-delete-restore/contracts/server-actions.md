# Contracts: server actions

Both live in `lib/actions/process.ts` beside `archiveProcess`, validate their input at the
boundary (Principle I) and check access on the server (Principle V). Both return the
codebase's `ActionResult` shape.

## `restoreProcess`

Undoes a deletion.

**Input**

```
{ workspaceId: string (min 1),
  processId:   string (min 1) }
```

**Behaviour**

1. Parse the input. Invalid → `VALIDATION_ERROR`.
2. `requireWorkspaceAccess(workspaceId, "EDITOR")`. Insufficient → the access error, no
   information about whether the process exists.
3. Load the process by id and confirm it belongs to `workspaceId`. Missing, or belonging to
   another workspace → `NOT_FOUND`. This covers FR-009: a process id from another
   workspace is indistinguishable from one that does not exist.
4. Set `archivedAt` to null.
5. Revalidate the Processes list and the deleted-processes page.

**Returns**: `ok({ id })`.

**Idempotent.** A process that is already live takes step 4 as a no-op and still returns
`ok` (FR-011). No error, no lock, no check — the write is the same either way.

**Not done**: no touching of steps, activities, assignments, rules, KPIs or documentation.
The whole point is that none of it moved.

---

## `getProcessDeleteImpact`

Describes what a delete would take with it, so the confirmation can say so. Reads only.

**Input**

```
{ workspaceId: string (min 1),
  processId:   string (min 1) }
```

**Behaviour**

1. Parse. Invalid → `VALIDATION_ERROR`.
2. `requireWorkspaceAccess(workspaceId, "EDITOR")` — the same bar as the delete it
   precedes, so a viewer cannot use it to enumerate a workspace's contents.
3. Load the process in the workspace. Missing → `NOT_FOUND`.
4. Gather the six counts in `data-model.md`, the sub-process and branching counts filtered
   to live processes only.

**Returns**: `ok(ProcessDeleteImpact)`.

**Deliberately not cached.** The numbers describe the process as it is when the dialog
opens. If another editor adds a step in the seconds before confirmation, the dialog is
stale — accepted in the spec's assumptions, because the alternative is live-subscribing a
confirmation dialog to a process it is about to delete.

---

## Unchanged

`archiveProcess` keeps its current signature and behaviour. The confirmation in front of it
changes; what it does does not.
