# Feature Specification: Report Composer

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "i need to change the arrangement, what i have in mind, to have like a check box for all items and i can pick what i need to show in the report, along with ordering option" — refined across four rounds of review against an interactive mockup.

## Context

The Export Report page already chooses **which processes** go into a pack and in what order. What the pack is **made of** is fixed in code: a set sequence of pack-level sections, and within every process a set sequence of four sections. A consultant preparing a document for a client cannot leave out a section the client did not ask for, cannot put the thing the client cares about first, and cannot tell — from the pack alone — whether a missing section was excluded on purpose or is simply empty, because a section with no data disappears without trace.

Four decisions were settled with the user against a working mockup, and each is a requirement below:

1. **Everything renumbers.** Sections are `N.0` and the blocks inside them `N.M`, always following the order they are actually in.
2. **The arrangement belongs to one client.** Saved per workspace, not globally and not only in a link.
3. **Ticked but empty still prints**, marked "no data yet". Unticking is the only way to remove something.
4. **The RACI grid and the authority rules move as one**, because the rules are a column of that table rather than a table of their own.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Leave out what the client did not ask for (Priority: P1)

A consultant is preparing a pack for a client who wants the process maps and the responsibilities, and has no interest in the KPI tables or the org chart. They untick those sections and export. The pack contains exactly what was ticked, numbered as though the unticked parts had never existed.

**Why this priority**: This is the whole ask in its simplest form, and it is useful on its own — a consultant who can only ever *exclude* has already gained control they do not have today.

**Independent Test**: Untick two sections, export, and confirm the document contains neither and that the remaining sections are numbered without gaps.

**Acceptance Scenarios**:

1. **Given** a pack with all sections ticked, **When** an editor unticks Executive Summary and exports, **Then** no process in the document has an Executive Summary, and what was 2.0 is now 1.0.
2. **Given** an editor unticks a block inside a section, **When** they export, **Then** that block is absent from every process and the remaining blocks in that section renumber without a gap.
3. **Given** an editor unticks every block in a section but leaves the section ticked, **When** they export, **Then** the section still appears, keeps its number, and is marked as having nothing recorded.
4. **Given** an editor unticks a pack-level section, **When** they export, **Then** it is absent from the document.
5. **Given** a read-only user, **When** they open the Export Report page, **Then** they are shown no arranging controls at all, but can still preview and export the report.

---

### User Story 2 - Put the important part first (Priority: P2)

The consultant moves the RACI & Authority section above the Process Map, because this client's question is about accountability rather than mechanics. Every number follows.

**Why this priority**: Reordering is worth less than excluding — a pack with the right content in the wrong order is still usable — but it is what makes the pack feel written for the client rather than generated.

**Independent Test**: Move a section to the top, export, and confirm both the document order and every section and block number changed to match.

**Acceptance Scenarios**:

1. **Given** the default order, **When** an editor moves RACI & Authority Matrix above Process Map & Narrative, **Then** in the exported document RACI is `1.0` and Process Map is `2.0`, and their blocks renumber to `1.1…` and `2.1…`.
2. **Given** a block inside a section, **When** an editor moves it past the last position in its section, **Then** it prints under the next section and takes that section's number as its prefix.
3. **Given** an editor moves the RACI grid, **When** the move completes, **Then** the authority rules move with it and remain immediately alongside it.
4. **Given** the authority rules, **When** an editor looks for a way to move them alone, **Then** there is none, and the reason is stated where the control would be.
5. **Given** the pack-level sections, **When** an editor reorders them, **Then** the exported document's front and back matter follow that order.
6. **Given** any arrangement, **When** an editor views the page, **Then** the order and numbering shown on screen match what the exported document will contain.

---

### User Story 3 - The arrangement is this client's (Priority: P2)

The consultant arranges one client's pack, moves to another client, and finds that client's own arrangement untouched. A colleague opening the first client sees the arrangement that was left there.

**Why this priority**: Equal in weight to ordering — an arrangement that leaked between clients would be worse than no arrangement at all, because a consultant would have to check it before every export.

**Independent Test**: Arrange workspace A, confirm workspace B is unchanged, return to A and confirm the arrangement survived; then open A as a different user and confirm they see the same arrangement.

**Acceptance Scenarios**:

1. **Given** two workspaces, **When** an editor changes the arrangement in one, **Then** the other's arrangement is unchanged.
2. **Given** an arrangement saved in a workspace, **When** the editor leaves and returns, **Then** the arrangement is as they left it.
3. **Given** an arrangement saved by one editor, **When** a different editor with access opens the same workspace, **Then** they see that arrangement rather than the default.
4. **Given** a workspace that has never been arranged, **When** anyone opens the Export Report page, **Then** they see the standard arrangement, with every section and block included, in the order the report uses today.
5. **Given** a read-only user, **When** they submit an arrangement change directly, **Then** the server refuses it.
6. **Given** an arrangement change, **When** it is saved, **Then** it applies to the report preview, its printed form and the slide deck alike.

---

### User Story 4 - See what is still to be captured (Priority: P3)

A section the consultant has deliberately kept appears in the pack even when the client has not yet supplied anything for it, marked as having nothing recorded — so the pack doubles as a list of what is still outstanding.

**Why this priority**: The smallest change of the four, and the one a first release could ship without. It reverses today's silent disappearance, which is the behaviour that makes "excluded" and "empty" indistinguishable.

**Independent Test**: Export a pack for a process with no KPIs, with the KPI block ticked; the block appears, numbered, marked as empty. Untick it; it disappears entirely.

**Acceptance Scenarios**:

1. **Given** a process with no KPIs and the KPI block ticked, **When** the pack is exported, **Then** the KPI block appears in its place with its number and a clear mark that nothing is recorded.
2. **Given** the same process, **When** the editor unticks the KPI block, **Then** it does not appear at all.
3. **Given** a pack-level section whose workspace has no data for it, **When** it is ticked, **Then** it appears marked as empty rather than vanishing.
4. **Given** an arranged pack, **When** an editor looks at the page before exporting, **Then** they can see which ticked sections will come out empty, without exporting to find out.

---

### Edge Cases

- **Everything unticked.** A pack with no sections ticked must produce a document that says so rather than an empty file or an error.
- **A section emptied of blocks by moving rather than unticking.** Its blocks having all moved elsewhere, the section is ticked and genuinely has nothing — it prints as an empty section, exactly as if its blocks had no data.
- **Two editors arranging at once.** The last save wins; neither editor sees an error, and neither ends up with a half-applied arrangement.
- **A new section added to the product later.** A workspace arranged before that section existed must not hide it silently; an unknown section appears in its default position, ticked.
- **A shared report link.** An existing link to a report continues to work and reflects the workspace's current arrangement rather than the arrangement in force when the link was made.
- **A process that has no data at all.** Every ticked section prints as empty; the document still names the process and its place in the pack.

## Requirements *(mandatory)*

### Functional Requirements

**Arranging (User Stories 1 and 2)**

- **FR-001**: The Export Report page MUST let an editor include or exclude each pack-level section, each per-process section, and each block within a section.
- **FR-002**: The page MUST let an editor change the order of pack-level sections, of per-process sections, and of blocks.
- **FR-003**: Moving a per-process section MUST carry its blocks with it.
- **FR-004**: A block MUST be able to move past a section boundary into the neighbouring section, and MUST then print and be numbered under that section.
- **FR-005**: The RACI grid and the authority rules MUST move as a single unit; the authority rules MUST NOT be independently movable, and the page MUST say why where the control would otherwise be.
- **FR-006**: The RACI grid and the authority rules MUST each keep their own include/exclude control. Excluding either MUST change only which columns the table prints, never the number of tables.
- **FR-007**: Every arranging control MUST be operable by keyboard alone and MUST meet the project's accessibility bar.
- **FR-008**: The page MUST show the resulting order and numbering before export, matching what the document will contain.

**Numbering (User Story 1 and 2)**

- **FR-009**: Per-process sections MUST be numbered `N.0`, where `N` is their position among the *included* sections.
- **FR-010**: Blocks MUST be numbered `N.M`, where `N` is their section's number and `M` is their position among the *included* blocks of that section.
- **FR-011**: Excluding a section or block MUST close the gap in the numbering; the document MUST never print a number that skips.
- **FR-012**: Numbering MUST be identical on screen and in every exported format.

**Saving (User Story 3)**

- **FR-013**: The arrangement MUST be stored against the workspace it was made in.
- **FR-014**: Changing one workspace's arrangement MUST NOT change any other workspace's.
- **FR-015**: An arrangement MUST persist across sessions and MUST be visible to every user with access to that workspace.
- **FR-016**: A workspace that has never been arranged MUST behave exactly as the report does today: every section and block included, in the current order.
- **FR-017**: Saving an arrangement MUST require edit access, checked on the server regardless of what the page displayed.
- **FR-018**: A user without edit access MUST be shown no arranging control, and MUST still be able to preview, export and read the report.
- **FR-019**: A section or block the stored arrangement does not mention MUST appear in its default position, included — so a part added to the product later is never silently hidden from an already-arranged workspace.

**Exporting (User Stories 1–4)**

- **FR-020**: The report preview and its printed form MUST honour the arrangement.
- **FR-021**: The slide deck export MUST honour the arrangement, including which sections
  become slides and in what order.
- **FR-022**: The per-process RACI and Authority spreadsheet downloads MUST be unaffected
  by the arrangement. They are downloads of one process's matrix, reached from that
  process's own page, not part of the report pack — arranging a pack must not silently
  change what a colleague gets when they export a single matrix.
- **FR-023**: An included section or block with no data MUST still appear, keep its number, and be marked as having nothing recorded.
- **FR-024**: An excluded section or block MUST NOT appear at all, in any format.
- **FR-025**: A pack with nothing included MUST produce a document that states it is empty rather than failing.
- **FR-026**: Which processes go into a pack, and their order, MUST continue to work exactly as they do today.

### Key Entities

- **Report arrangement**: One per workspace. Records which pack sections, per-process sections and blocks are included, and the order of each — including which section a block currently belongs to. Absent until a workspace is first arranged.
- **Section**: A named part of the pack. Either pack-level (appearing once) or per-process (repeating). Carries blocks.
- **Block**: A named part of a section. Belongs to exactly one section at a time, and can be moved to another.
- **Emptiness**: Not stored. Whether a section or block has anything to show is decided at export time from the workspace's actual data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can produce a client pack containing only the sections that client asked for, in the order that client cares about, without leaving the Export Report page.
- **SC-002**: Arranging a pack takes under two minutes for a consultant who has not done it before, and no step requires exporting to see the result.
- **SC-003**: The order and numbering a consultant sees before exporting match the exported document exactly, in both the printed report and the slide deck, 100% of the time.
- **SC-004**: An arrangement made for one client has no effect on any other client's pack.
- **SC-005**: A consultant can tell, from the pack alone, the difference between a section they excluded and a section the client has not yet filled in.
- **SC-006**: No user without edit access encounters an arranging control, and no arrangement change submitted without edit access succeeds.
- **SC-007**: A workspace nobody has arranged produces byte-comparable content to what it produces today.

## Assumptions

- **One arrangement per workspace, not per pack.** A consultant who wants two differently-shaped packs for the same client rearranges between exports. Named or saved arrangements are a larger feature and are out of scope.
- **The default is today's report.** The standard arrangement is everything included in the current order, so nothing changes for anyone who never opens the new controls.
- **Emptiness is decided at export time**, from the data as it stands, and is never stored — so filling in a client's KPIs makes the empty mark disappear without anyone rearranging anything.
- **Control points are not a block.** They are derived from the RACI and authority data rather than recorded, so they follow the Governance section they are printed in rather than being separately included or excluded.
- **Last save wins.** Two editors arranging the same workspace at once is rare enough that a lock, a merge or a conflict warning would cost more than it saves.
- **Process selection stays in the link.** Which processes are in a pack, and their order, continue to live in the report's address so a shared link stays as it was sent; only the arrangement moves into storage.
- **The word "delete" is not used** anywhere in these controls — a section is included or not, and nothing about arranging a pack changes the underlying data.

## Out of Scope

- Named or multiple saved arrangements per workspace, and copying an arrangement from one client to another.
- A firm-wide default arrangement that new workspaces inherit.
- Arranging anything below block level — the contents of a table, the columns of the RACI grid beyond the two controls named above, or the order of steps within a narrative.
- Per-process arrangement: the arrangement applies to every process in the pack, not to one process differently from another.
- Changing what any section contains, how it is laid out, or how it is worded. This feature decides whether and where a section appears, not what is inside it.
- Custom or user-authored sections.
