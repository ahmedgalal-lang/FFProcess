# Feature Specification: Delete Warning & Process Restore

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "can i reterve deleted process ? and we need a message to warn the user"

## Context

Deleting a process today does not destroy anything — it marks the process as deleted and
every list, report and export simply stops showing it. Its steps, connections, RACI
assignments, authority rules, control points, KPIs and documentation all survive intact.

Two things are wrong with that:

1. **There is no way back.** Nothing in the application shows what has been deleted, and
   nothing can undo a deletion. A consultant who deletes the wrong process has to ask
   someone with direct database access to recover it.
2. **The warning says almost nothing.** The confirmation is a small inline "Delete?" with
   Yes and No. It does not name the process, does not say that a fortnight of mapping work
   is attached to it, and does not say the action can be undone — so it reads as more
   final than it is while giving the consultant less information than they need.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Put back a process deleted by mistake (Priority: P1)

A consultant deletes a process — the wrong one, or one a client later asks for back. They
open the workspace's list of deleted processes, find it by code and name, see when it was
deleted, and restore it. It returns to the Processes list with everything it had:
every step in order, the process map, the RACI matrix, the authority rules, the control
points, the KPIs and the report documentation.

**Why this priority**: This is the capability that does not exist at all. It is also what
makes the improved warning in User Story 2 honest — without it, the warning can only tell
a consultant to go and find an administrator.

**Independent Test**: Delete a fully populated process, confirm it has left every list and
the export report, restore it from the deleted list, and confirm it reappears everywhere
with identical content.

**Acceptance Scenarios**:

1. **Given** a workspace with a deleted process, **When** an editor opens the deleted
   processes view, **Then** they see that process with its code, its name, and the date it
   was deleted.
2. **Given** a deleted process with 14 steps, a RACI matrix and authority rules, **When**
   an editor restores it, **Then** it reappears in the Processes list and all 14 steps,
   the RACI matrix and every authority rule are present and unchanged.
3. **Given** a workspace with nothing deleted, **When** an editor opens the deleted
   processes view, **Then** they are told plainly that nothing has been deleted, rather
   than shown an empty table.
4. **Given** a read-only user, **When** they view the workspace, **Then** they are shown
   neither the deleted processes view nor any restore control.
5. **Given** a read-only user who submits a restore request directly, **When** the server
   receives it, **Then** it is refused.
6. **Given** a process was restored, **When** an editor opens the deleted processes view
   again, **Then** that process is no longer listed there.

---

### User Story 2 - See what a delete takes with it (Priority: P2)

Before confirming, a consultant is told exactly which process they are about to delete,
what work is attached to it, what else in the workspace points at it, and that the action
can be undone from the deleted processes view.

**Why this priority**: Prevents the mistake rather than repairing it, but depends on
User Story 1 to be able to promise recovery truthfully.

**Independent Test**: Trigger delete on a process with known contents and read the
confirmation — it should name the process and describe its contents accurately without
the deletion having happened yet.

**Acceptance Scenarios**:

1. **Given** a process "PUR101 · Purchase-to-Pay" with 14 steps, **When** an editor
   triggers delete, **Then** the confirmation names it by code and name and states that it
   has 14 steps.
2. **Given** a process that also holds RACI assignments, authority rules and KPIs,
   **When** an editor triggers delete, **Then** the confirmation says so rather than
   mentioning steps alone.
3. **Given** a process with no steps and no matrix, **When** an editor triggers delete,
   **Then** the confirmation says it is empty rather than listing zeroes.
4. **Given** any process, **When** an editor triggers delete, **Then** the confirmation
   states the deletion can be undone and names where.
5. **Given** an editor reading the confirmation, **When** they decline, **Then** nothing
   is deleted and the process is untouched.

---

### User Story 3 - Nested and branching processes stay coherent (Priority: P3)

A process may have sub-processes filed beneath it, and other processes may branch from one
of its steps. Deleting it leaves those references pointing at something now hidden. The
consultant is warned about that before deleting, and restoring puts the relationship back.

**Why this priority**: Affects a minority of processes, and the consequence today is
confusing rather than destructive — the references survive and reconnect on restore.

**Independent Test**: Delete a process that has two sub-processes and one process
branching from its steps; confirm the warning names all three, that the three survive the
deletion, and that restoring re-establishes the original display.

**Acceptance Scenarios**:

1. **Given** a process with two sub-processes, **When** an editor triggers delete,
   **Then** the confirmation says two sub-processes will be left without their parent.
2. **Given** a process whose step another process branches from, **When** an editor
   triggers delete, **Then** the confirmation says that process will lose its stated
   starting point.
3. **Given** a parent process was deleted, **When** an editor views the Processes list,
   **Then** its sub-processes are still listed and reachable.
4. **Given** a deleted parent is restored, **When** an editor views the Processes list,
   **Then** its sub-processes appear nested beneath it again.
5. **Given** a sub-process whose parent is still deleted, **When** an editor restores the
   sub-process, **Then** the restore succeeds and the sub-process is listed and reachable.

---

### Edge Cases

- **A process deleted twice.** A second delete on an already-deleted process must not
  overwrite the original deletion date or produce an error the consultant has to read.
- **Restoring something already restored.** Two editors restoring the same process, or one
  editor double-submitting, must leave the process restored once, not produce a failure.
- **The code is still taken.** A deleted process keeps its process code reserved, so no
  process created after the deletion can occupy it and a restore can never collide.
- **A deleted process still referenced by a report link.** A previously shared export link
  naming a deleted process must continue to omit it, exactly as today, and must start
  including it again once restored.
- **The process being deleted is the workspace's only process.** The Processes list must
  fall back to its empty state rather than a broken tree.
- **Long-deleted processes accumulating.** The deleted processes view must stay readable
  when a workspace has many deleted processes, showing the most recently deleted first.

## Requirements *(mandatory)*

### Functional Requirements

**Restore (User Story 1)**

- **FR-001**: The system MUST provide, per workspace, a view listing every process that has
  been deleted and not since restored.
- **FR-002**: Each entry in that view MUST show the process code, the process name, and the
  date the process was deleted.
- **FR-003**: The view MUST order entries most recently deleted first.
- **FR-004**: Users with edit access MUST be able to restore any listed process, returning
  it to the Processes list and to every other place a process appears — search, the value
  chain, the helicopter view, the export picker, the report and the deck.
- **FR-005**: Restoring MUST NOT change anything beneath the process: steps and their
  order, connections, activities, RACI assignments, authority rules and their order,
  control points, KPIs, purpose, scope and external entities all return exactly as they
  were at the moment of deletion.
- **FR-006**: A restored process MUST no longer appear in the deleted processes view.
- **FR-007**: Users without edit access MUST NOT be shown the deleted processes view or any
  restore control anywhere in the application.
- **FR-008**: The system MUST refuse a restore request from a user without edit access on
  the workspace, independently of what the client displayed.
- **FR-009**: The system MUST refuse a restore request naming a process belonging to a
  different workspace than the one the request addresses.
- **FR-010**: Restoring a process whose parent process is itself still deleted MUST
  succeed, and the restored process MUST remain visible and reachable in the Processes
  list rather than disappearing beneath a hidden parent.
- **FR-011**: Restoring an already-restored process MUST leave it restored and report
  success rather than failing.
- **FR-012**: A deleted process MUST continue to be excluded from every list, search
  result, picker, report and export until it is restored.

**Delete confirmation (User Story 2)**

- **FR-013**: The confirmation shown before a process is deleted MUST identify the process
  by its code and its name.
- **FR-014**: The confirmation MUST state how much work is attached to the process,
  covering at minimum: the number of process steps, and whether the process holds RACI
  assignments, authority rules, or KPIs. Control points are not counted separately because
  they are derived from the RACI and authority data rather than recorded, so saying the
  matrix is going already says the control points are.
- **FR-015**: Where the process holds none of those, the confirmation MUST say the process
  is empty rather than enumerate zero counts.
- **FR-016**: The confirmation MUST state that the deletion can be undone, and name where
  the process can be recovered from.
- **FR-017**: The confirmation MUST require a deliberate act to proceed and MUST offer an
  equally reachable way to decline, leaving the process untouched.
- **FR-018**: The confirmation MUST be operable by keyboard alone and MUST meet the
  project's accessibility bar, including for the warning text about attached work.
- **FR-019**: Nothing in the confirmation MUST be shown to a user without edit access,
  since the delete control itself is not shown to them.

**References (User Story 3)**

- **FR-020**: Where the process has sub-processes filed beneath it, the confirmation MUST
  say how many, and state that they will be left without their parent.
- **FR-021**: Where other processes branch from one of this process's steps, the
  confirmation MUST say how many, and state that they will lose their stated starting
  point.
- **FR-022**: Deleting a process MUST NOT delete, alter or hide its sub-processes, or any
  process that branches from it.
- **FR-023**: Restoring a process MUST restore the display of those relationships without
  the consultant having to re-enter them.

### Key Entities

- **Process**: A documented business process within a workspace. Already carries a
  deletion timestamp that is set when deleted and, under this feature, cleared when
  restored. Its code stays reserved while it is deleted.
- **Deleted process listing**: The set of a workspace's processes that carry a deletion
  timestamp — a view over existing data, not new stored information.
- **Delete impact summary**: What a process carries and what points at it, assembled at
  the moment the consultant asks to delete so the confirmation can describe it. Not
  stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant who deletes a process by mistake can have it back, complete and
  unchanged, without leaving the application and without anyone else's help.
- **SC-002**: Recovering a deleted process takes under one minute from noticing the
  mistake, and no more than three interactions.
- **SC-003**: 100% of a restored process's content — steps, connections, RACI assignments,
  authority rules, control points, KPIs and documentation — matches what it held before
  deletion.
- **SC-004**: Before confirming a deletion, a consultant can state from the confirmation
  alone which process is going, how much work is attached to it, what else in the workspace
  points at it, and whether it can be undone.
- **SC-005**: No user without edit access encounters a delete or restore control anywhere,
  and no restore submitted without edit access succeeds.
- **SC-006**: Requests to recover deleted processes through direct database access fall to
  zero.

## Assumptions

- Deletion remains reversible by design — the existing behaviour of marking a process
  deleted rather than destroying it is kept, not replaced by a real deletion.
- No time limit on recovery. A deleted process stays recoverable indefinitely; no purge,
  retention window or permanent-delete action is introduced by this feature.
- Edit access is the bar for restore, matching the access already required to delete.
  Workspace administrators and firm owners hold it by virtue of their broader access.
- Sub-processes of a deleted parent already remain listed and reachable today, so this
  feature warns about the relationship and restores its display rather than changing what
  survives.
- Process codes stay reserved by deleted processes today, so a restore can never collide
  with a process created in the meantime. This feature relies on that and does not change
  it.
- The confirmation describes the process's contents as they are at the moment the
  consultant asks to delete. It is not expected to stay live if another editor changes the
  process in the seconds before confirmation.
- The word used in the interface stays "delete", because that is what a consultant means;
  the copy carries the reassurance that it can be undone rather than renaming the action
  to "archive".

## Out of Scope

- Roles and people, which are deleted the same way and have the identical gap. They are
  deliberately left for a later change.
- Permanent deletion — a way to destroy a process for good, for example to satisfy a
  client data-removal request.
- An audit trail of who deleted or restored a process, and when. Only the deletion date is
  shown, because only the deletion date is recorded today.
- Bulk restore, or restoring a parent together with its sub-processes in one action.
- Undo for anything smaller than a whole process — steps, RACI assignments and authority
  rules are unaffected by this feature.
