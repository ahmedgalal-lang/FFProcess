# Feature Specification: Process Ordering

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-06

**Status**: Draft

**Input**: User description: "process arranging option should be added, here and the exporting - preview page"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arrange the process library (Priority: P1)

A consultant opens the Processes page for a client and sees the workspace's processes in
whatever order they were given. The order does not match how the work actually runs — the
opportunity process should come before pricing, and execution last — but today the only
lever is the process code, so the list reads alphabetically by an identifier the client
never sees. The consultant moves each process up or down until the list reads in the order
the engagement runs, and that order sticks for everyone who opens the workspace.

**Why this priority**: This is the request, and it is the foundation the other two stories
build on: with no stored order there is nothing for the export to inherit. It also stands
alone — a correctly ordered library is useful even if nothing is ever exported.

**Independent Test**: Reorder processes on the Processes page, reload, and confirm the new
order persists; confirm a second person opening the workspace sees the same order.

**Acceptance Scenarios**:

1. **Given** a workspace with several top-level processes, **When** the consultant moves one
   process up, **Then** it swaps position with the process above it and the change is saved
   without a further confirmation step.
2. **Given** a process already at the top of the list, **When** the consultant tries to move
   it up, **Then** nothing changes and no error is shown.
3. **Given** a top-level process with sub-processes indented beneath it, **When** the
   consultant moves that parent, **Then** its sub-processes travel with it and stay indented
   beneath it.
4. **Given** a parent with two sub-processes, **When** the consultant moves the second
   sub-process up, **Then** it swaps with its sibling and remains under the same parent.
5. **Given** a workspace whose processes have never been arranged, **When** the consultant
   opens the Processes page, **Then** the processes appear in a stable, predictable order
   rather than an arbitrary one.

---

### User Story 2 - The arranged order carries into the exported pack (Priority: P2)

The consultant has arranged the library to read in engagement order. They now build a client
pack. The export picker lists the processes in that same arranged order, and the generated
report — its contents index and the body sections that follow — presents the processes in
that order too, as does the PowerPoint version. The client reads the pack in the sequence the
consultant intended rather than in code order.

**Why this priority**: The arranged order is only worth much if it reaches the thing the
client actually sees. Separated from P1 because the ordering has to exist before anything can
inherit it, and because the library being right is already useful on its own.

**Independent Test**: With an arranged workspace, open the export picker and confirm the
order matches the Processes page; generate the report and the PPTX and confirm the contents
index, the per-process sections, and the slides all follow the same order.

**Acceptance Scenarios**:

1. **Given** an arranged workspace, **When** the consultant opens the export picker, **Then**
   the processes are listed in the arranged order.
2. **Given** an arranged workspace with a subset of processes selected, **When** the report is
   generated, **Then** the contents index lists the selected processes in arranged order and
   the per-process sections appear in that same order.
3. **Given** the same selection, **When** the PowerPoint version is downloaded, **Then** its
   per-process slides follow the same order as the report.
4. **Given** a selection that includes a sub-process but not its parent, **When** the report is
   generated, **Then** the sub-process still appears in a sensible position rather than being
   dropped or moved to the end.

---

### User Story 3 - Order one pack without disturbing the library (Priority: P3)

The consultant is assembling a pack for a particular audience — a board that wants execution
first, say — and for this pack only the order should differ from the library's. They arrange
the selected processes on the export side and generate the report. The pack comes out in that
order; the workspace's own order is untouched, so the next pack, and everyone else's view of
the library, is unaffected. Sending someone the report link gives them the pack in the same
order it was arranged in.

**Why this priority**: A convenience on top of P1 and P2 — a pack in library order is already
useful, and the same result can be had by reordering the library. Worth having because the
right order for one audience is often not the right order for the library, and reordering is
most often noticed at the moment of assembling a pack.

**Independent Test**: From the export side, reorder two selected processes, generate the
report, confirm it follows the new order, then open the Processes page and confirm the library
order is unchanged.

**Acceptance Scenarios**:

1. **Given** a selection on the export side, **When** the consultant moves a process up or
   down, **Then** the list reflects the new order immediately.
2. **Given** a pack arranged differently from the library, **When** the report is generated,
   **Then** the report follows the pack's order.
3. **Given** a pack arranged differently from the library, **When** the consultant afterwards
   opens the Processes page, **Then** the library order is exactly as it was before.
4. **Given** a generated report arranged for one audience, **When** its link is opened again by
   anyone with access, **Then** the report is still in the order it was arranged in.
5. **Given** a pack arranged for one audience, **When** the consultant starts a new pack,
   **Then** it begins in library order rather than inheriting the previous pack's arrangement.

---

### Edge Cases

- **A sub-process whose parent is not in the workspace list** (an orphan, which the Processes
  page already handles separately today): it must remain reachable and orderable rather than
  disappearing from the arranged list.
- **Two processes given the same position** (concurrent edits by two people, or data seeded
  outside the app): the list must still render in a stable, repeatable order rather than
  shuffling between page loads.
- **A workspace where no process has ever been arranged**: every process shares the same
  default position, so the fallback ordering must be deterministic.
- **A process created after arranging**: it must appear at a predictable place rather than an
  arbitrary one, and must not silently displace the existing arrangement.
- **A process deleted from the middle of the arrangement**: the remaining order must stay
  intact, with no visible gap in behaviour.
- **Moving a parent across another parent that has its own sub-processes**: both families must
  stay intact, with no interleaving of one parent's children under another.
- **A viewer without edit rights**: they must see the arranged order but must not be offered
  controls that change the library's order, and must not be able to change it by other means.
  Arranging a pack they are assembling changes nothing stored, so it need not be restricted the
  same way.
- **A pack naming a process that has since been deleted or moved to another workspace**: the
  report must render the processes that remain, in the arranged order, rather than failing.
- **A pack whose carried order names only some of its processes** (a hand-edited or truncated
  link): the named ones must keep their given order and the rest must fall in behind them
  deterministically, rather than the report refusing to render.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store an explicit position for each process within its workspace,
  independent of the process code, name, or creation time.
- **FR-002**: Users with edit rights MUST be able to move a process one place earlier or later
  in the list from the Processes page.
- **FR-003**: The system MUST keep sub-processes grouped with their parent: moving a parent
  moves its sub-processes with it, and a sub-process moves only among its siblings.
- **FR-004**: The system MUST persist a reorder immediately, so it survives a reload and is
  seen by every other person with access to that workspace.
- **FR-005**: The system MUST present processes in a deterministic order at all times,
  including when positions are absent, equal, or newly seeded, falling back to process code so
  that two loads of unchanged data never differ.
- **FR-006**: A newly created process MUST take a defined position (the end of its level)
  rather than an arbitrary one, and MUST NOT change the relative order of existing processes.
- **FR-007**: The export picker MUST list processes in the arranged order.
- **FR-008**: The generated report MUST follow the arranged order in both its contents index
  and the sequence of its per-process sections.
- **FR-009**: The PowerPoint export MUST follow the same order as the report, from the same
  source, so the two cannot drift apart.
- **FR-010**: Users MUST be able to reorder the processes selected for one pack from the export
  side, and that arrangement MUST apply to that pack alone.
- **FR-014**: A pack's own arrangement MUST NOT change the workspace's stored order, nor what
  any other pack or user sees.
- **FR-015**: A pack MUST start in the workspace's arranged order, so a consultant who does not
  rearrange gets the library order without doing anything.
- **FR-016**: A pack's arrangement MUST travel with the report it produced, so re-opening or
  sharing that report reproduces the same order rather than falling back to library order.
- **FR-011**: Reordering MUST be operable by keyboard alone and MUST NOT rely on pointer
  dragging as the only means, nor on colour or position alone to convey what moved.
- **FR-012**: The system MUST reject a reorder request for a process outside the requesting
  user's workspace, and MUST reject one from a user without edit rights, enforced on the
  server rather than only hidden in the interface.
- **FR-013**: Deleting a process MUST leave the order of the remaining processes intact.

### Key Entities

- **Process**: gains a position within its workspace. The position is meaningful only relative
  to its siblings — among top-level processes, or among the sub-processes of one parent — and
  carries no meaning across workspaces.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can put a workspace's processes into a chosen order using only the
  keyboard, without renaming or re-coding any process.
- **SC-002**: An order set once on the Processes page is the order seen on the export picker,
  the generated report, and the PowerPoint export, with no manual step in between — a pack the
  consultant does not rearrange comes out in library order.
- **SC-006**: A pack arranged for one audience can be produced without changing the library or
  any other pack, and re-opening that report's link reproduces its order exactly.
- **SC-003**: Reloading a workspace whose data has not changed produces exactly the same order
  every time, including for workspaces that have never been arranged.
- **SC-004**: A sub-process is never separated from its parent by any sequence of move
  operations.
- **SC-005**: Reordering a process takes effect without the consultant having to save, confirm,
  or regenerate anything.

## Assumptions

- **Manual arrangement, not sort presets.** "Arranging" is read as putting processes in a
  deliberate order by hand. Sorting by name, category, or step count is a different feature and
  is out of scope; process code remains the fallback when nothing has been arranged.
- **Move-one-place controls rather than drag-and-drop.** This matches the Steps List, which
  already solves the same problem in this product, and is keyboard-operable by default —
  drag-only reordering would fail Principle IV. Drag may be added later as an addition, not a
  replacement.
- **Two levels of nesting only.** The Processes page already renders a two-level tree
  (top-level processes, each followed by its sub-processes); ordering follows the same shape
  rather than introducing arbitrary depth.
- **Two orders, with the library as the default.** The workspace has one stored order (Story
  1). A pack may override it for itself (Story 3) without writing back. Confirmed by the user
  in preference to a single shared order, so that different audiences can get different
  sequences of the same processes.
- **A pack's order rides with the report rather than being stored.** The report is already
  addressed by a link naming the processes it covers, so the pack's order can live in that link
  — which is what makes an arranged report shareable and re-openable without inventing a stored
  "pack" the user then has to manage, name, or clean up (Principle VI).
- **Arranged where the pack is assembled.** The reordering controls belong with the selection
  step, and the preview then renders whatever order the link carries. Reordering from inside the
  preview itself is not assumed; if that is wanted, it is a small addition on top rather than a
  different design.
- **Existing workspaces start in their current order.** Processes that have never been arranged
  keep the code-ascending order they have today, so nothing appears to move on first deploy.
- **Reuses the existing ordering pattern.** Position, reorder operations, and permission checks
  follow the shape already established for steps and phases rather than inventing a second one
  (Principle II).

## Resolved Questions

- **Q1 — Is the export order the workspace order, or a per-pack order?** *(answered: per-pack)*
  Rearranging on the export side arranges that pack only and leaves the library untouched, so
  different audiences can get different sequences of the same processes. The workspace order
  remains the default a pack starts from. See FR-010 and FR-014 to FR-016, and the assumption
  about a pack's order riding with its report link.
