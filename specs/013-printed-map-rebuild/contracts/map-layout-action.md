# Contract: choosing a client's map layout

`lib/actions/report-map-layout.ts`

## `setReportMapLayout`

```ts
setReportMapLayout(input: {
  workspaceId: string;
  layout: "FLOW" | "ROLES";
}): Promise<ActionResult<{ workspaceId: string }>>
```

Mirrors `saveReportArrangement` next to it — same gate, same shape, same per-workspace
reasoning.

| Concern | Behaviour |
|---|---|
| Validation | Zod at the boundary; an unknown layout is `VALIDATION_ERROR`, not stored |
| Access | `requireWorkspaceAccess(workspaceId, "EDITOR")` — FR-022 |
| Scope | Writes `Workspace.reportMapLayout` for that workspace only |
| Concurrency | Last write wins, like the arrangement — two editors choosing at once is rare enough that a lock costs more than it saves |
| Revalidation | `revalidatePath` for the workspace's report |
| Returns | `ok({ workspaceId })` |

## Reading

The report's server component reads `workspace.reportMapLayout` directly in the query it
already runs — no action, no client fetch. An unset workspace reads `FLOW` from the column
default, so there is no "not chosen yet" branch anywhere in the code. (FR-021)

## UI contract

- The control sits in the report toolbar beside Spacing, labelled **Map layout**, offering
  **Flow** and **Roles**.
- Unlike Spacing, which is session state, choosing here persists immediately.
- It is rendered only when the viewer may edit (`useCanEdit()`), mirroring every other
  editor-gated control in the report. Server-side gating is the action's, not the UI's.
- When a chosen `ROLES` fell back to `FLOW`, the map says so where it is drawn — naming the
  role count and the ceiling — rather than silently disagreeing with the toolbar.
