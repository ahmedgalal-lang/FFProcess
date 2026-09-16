# Research: Delete Warning & Process Restore

Six questions the spec left open for implementation. Each was answered by reading the
codebase rather than by preference, so the feature lands as an extension of what is
already here.

## 1. Where does the deleted-processes view live?

**Decision**: its own page at `/workspaces/[workspaceId]/processes/deleted`, reached from a
link on the Processes page that is shown only to editors and carries a count when one or
more processes are deleted.

**Rationale**: the spec requires an empty state ("nothing has been deleted") that only
means something if the view can be opened when empty. A disclosure section on the
Processes page would have to either hide itself when empty — making that scenario
unreachable — or show an empty panel on every visit to a workspace that has never deleted
anything, which is the more common case by far. A page also gives the recovery step a URL
a consultant can be sent.

**Alternatives considered**:
- *A section at the bottom of the Processes page.* Least machinery, and puts recovery next
  to where the mistake happened. Rejected on the empty-state conflict above, and because a
  workspace with many deleted processes would push the live list off the screen.
- *A `?deleted=1` filter on the Processes page.* Reuses the page but forces every list
  query, the grouping into parent/child, and the row actions to branch on a mode flag —
  more conditional code in the page that matters most.

## 2. How is the delete impact summary gathered?

**Decision**: a server action called when the confirmation opens, not data pre-loaded with
the Processes list.

**Rationale**: the summary needs five counts, two of which (authority rules, and processes
branching from one of this process's steps) do not come from a `_count` on the Process row
and need their own queries. Computing that for every row of a list a consultant is usually
only reading would cost five extra queries per process to serve a dialog most rows never
open. The spec already says the summary is assembled "at the moment the consultant asks to
delete".

**Alternatives considered**:
- *Extend the existing list query's `_count`.* Covers steps, activities, authority
  assignments and sub-processes cheaply, but not authority rules or the branch count, so
  the dialog would still need a second call — two mechanisms instead of one.

## 3. What actually counts as "work attached to the process"?

**Decision**: steps, RACI assignments, authority rules, sub-processes, and processes that
branch from one of its steps. KPIs are read from the process row itself. Control points
are **not** counted.

**Rationale**: control points are derived in `deriveControlPoints` from the combined RACI
and authority rows — they are not stored, so there is no number to report and no separate
thing to lose. Saying the RACI matrix and the authority rules are going already says the
control points are. The spec was amended during this phase to stop asking for a count that
does not exist.

Where each count comes from:

| Fact | Source |
| --- | --- |
| Steps | `_count.steps` on the process |
| RACI assignments | `RaciAssignment` where the activity belongs to this process |
| Authority rules | `AuthorityRule` where the assignment belongs to this process |
| KPIs | length of the `kpis` array on the process row |
| Sub-processes | live processes whose `parentProcessId` is this process |
| Branching processes | live processes whose `branchFromStep` belongs to this process |

## 4. What dialog pattern does this codebase use?

**Decision**: reuse the modal shape already in `process-forms.tsx` — a fixed overlay with
`role="dialog"`, `aria-modal="true"`, an `aria-label`, and a click on the backdrop to
dismiss — and add two things it currently lacks: Escape to dismiss, and focus moved into
the dialog on open.

**Rationale**: the Clone and Edit dialogs in the same file already establish the visual and
structural pattern, so a third dialog that looks different would be the odd one out. But
Principle IV requires keyboard operability, and neither existing dialog handles Escape or
moves focus — a keyboard user opening one today has to tab from the top of the document.
The new dialog meets the bar; retrofitting the existing two is noted as a follow-up rather
than smuggled into this feature.

**Alternatives considered**:
- *Keep the current inline "Delete? Yes / No".* Cannot carry four lines of warning text
  without wrecking the table row it sits in.
- *The native `<dialog>` element.* Gives focus trapping and Escape for free, but nothing
  else in the codebase uses it, and mixing two dialog mechanisms in one file is worse than
  the twenty lines it saves.

## 5. How does restore reverse the deletion?

**Decision**: clear the deletion timestamp. Nothing else.

**Rationale**: `archiveProcess` sets `archivedAt` and touches nothing else, and every list,
report and export filters on `archivedAt: null`. Clearing it is therefore an exact inverse
— there is no second piece of state to put back, which is what makes FR-005 ("nothing
beneath the process changes") true by construction rather than by careful re-assembly.
`loadProcessInWorkspace` does not filter on `archivedAt`, so it already loads a deleted
process and can be reused as-is.

Two consequences worth stating:
- **Restore is idempotent.** Clearing a null timestamp is a no-op, so a double submit or
  two editors racing both end with the process restored, satisfying FR-011 without a lock.
- **No code collision is possible.** `createProcess` generates codes against every process
  in the workspace regardless of deletion state, so a deleted process's code stays reserved
  and nothing can have taken it (FR edge case).

## 6. How is access enforced?

**Decision**: `requireWorkspaceAccess(workspaceId, "EDITOR")` inside the restore action,
and `useCanEdit()` to decide whether the link and the controls render at all.

**Rationale**: this is exactly what `archiveProcess` does, and the established convention
in this codebase is that a read-only user is shown none of it rather than shown controls
the server will refuse — `ArchiveProcessButton` already returns `null` for a viewer. The
deleted-processes page needs the same treatment at the page level, not only on its
buttons, or a viewer could read the list of what has been deleted even though they cannot
act on it.

**Alternatives considered**:
- *Require ADMIN for restore.* Rejected: restore is strictly less destructive than the
  delete that EDITOR already permits, so a higher bar would leave the person who made the
  mistake unable to fix it.
