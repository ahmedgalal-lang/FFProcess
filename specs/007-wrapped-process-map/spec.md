# Feature Specification: Wrapped Process Map

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "the view is not complete for the process and helicopter view" — the Helicopter View was genuinely clipped and has been fixed separately. The process map turned out to be complete but illegible, and the user chose "wrap onto several rows" from four options after reviewing a screenshot of a 22-step process at roughly 30px per step.

## Context

The exported report draws a process map as one horizontal row of steps in swimlanes, then shrinks the whole drawing until it fits a fixed-height box. Nothing is lost — every step is on the page — but a long process is shrunk so far that the steps cannot be read. At 22 steps each one is about a centimetre wide on a printed A4 sheet.

A consultant hands this pack to a client. A diagram the client cannot read is not much better than one that was cut off.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A long process stays readable (Priority: P1)

A consultant exports a pack containing a 22-step process. Instead of one row squeezed across the page, the map continues onto a second and third row, each at a size a reader can actually read.

**Why this priority**: This is the whole request. A short process is unaffected, so this is also the only story that changes anything for most packs.

**Independent Test**: Export a process with more steps than fit one row and confirm the steps are rendered at a readable size across several rows, with none missing.

**Acceptance Scenarios**:

1. **Given** a process with more steps than fit the page width, **When** it is exported, **Then** the map continues onto further rows rather than shrinking below a readable size.
2. **Given** the same process, **When** it is exported, **Then** every step appears exactly once.
3. **Given** a process short enough to fit one row, **When** it is exported, **Then** it renders exactly as it does today — one row, no wrapping.
4. **Given** a wrapped map, **When** a reader follows it, **Then** the order of steps is unambiguous: the end of one row visibly continues into the start of the next.
5. **Given** a wrapped map, **When** it is printed, **Then** every step is legible at printed size.

---

### User Story 2 - Swimlanes still say who does what (Priority: P1)

The map is a swimlane diagram: each step sits in the lane of the role that performs it. A wrapped map keeps that meaning — a reader can still tell, for any step on any row, whose lane it is in.

**Why this priority**: Equal to User Story 1 and inseparable from it. A wrapped map that lost its lanes would be readable and wrong, which is worse than unreadable and right — the lane is who is accountable.

**Independent Test**: Export a process whose steps span several roles and more than one row, and confirm every step is still in its role's lane and every row's lanes are labelled.

**Acceptance Scenarios**:

1. **Given** a process with steps across three roles wrapping onto two rows, **When** it is exported, **Then** each row shows the lanes and each step sits in the lane of its own role.
2. **Given** a wrapped map, **When** a reader looks at any row, **Then** they can tell which lane is which without referring back to the first row.
3. **Given** a process with steps that have no role, **When** it is exported, **Then** the "Unassigned" lane appears on every row that contains such a step, exactly as it does on a single-row map.
4. **Given** a row where one lane contains no steps, **When** it is exported, **Then** that row does not waste the page on an empty lane.

---

### User Story 3 - Branches and decisions survive the wrap (Priority: P2)

A process is a graph, not a list: decisions fan out, paths rejoin, and some steps are reached more than one way. A wrapped map keeps those connections readable.

**Why this priority**: Affects fewer processes than the first two, and a map whose branches are hard to follow is still more use than one nobody can read at all. But a branch drawn wrongly is a governance error, not a cosmetic one.

**Independent Test**: Export a process containing a decision with two outgoing paths that later rejoin, wrapped onto more than one row, and confirm both paths are drawn and land where they should.

**Acceptance Scenarios**:

1. **Given** a decision step with two outgoing connections, **When** the map wraps, **Then** both connections are drawn and reach their targets.
2. **Given** a connection whose two steps land on different rows, **When** the map is exported, **Then** the connection is drawn in a way a reader can follow rather than as a line straight across unrelated steps.
3. **Given** a connection carrying a label, **When** its two steps land on different rows, **Then** the label is still shown and still attached to that connection.
4. **Given** a process whose paths rejoin, **When** the map wraps, **Then** no step is drawn twice to make the picture tidier.

---

### User Story 4 - The interactive map is untouched (Priority: P1)

A consultant arranging steps by hand on the Process Map page sees exactly what they saw before. Their stored positions are theirs.

**Why this priority**: A silent regression here would be the most expensive outcome of this change — a consultant's deliberate arrangement rewritten by a rendering decision made for print.

**Independent Test**: Record a process's step positions, export the report, and confirm the positions are unchanged and the interactive map looks as it did.

**Acceptance Scenarios**:

1. **Given** a process arranged by hand, **When** the report is exported, **Then** no step's stored position changes.
2. **Given** the same process, **When** a consultant opens the Process Map page, **Then** it renders as it did before this feature, panning and zooming as before.
3. **Given** a process whose map wraps in the report, **When** a consultant opens the Process Map page, **Then** it is not wrapped there.

---

### Edge Cases

- **A single step.** A process with one step must not wrap, and must not be laid out as though it were the start of a long row.
- **One very long lane.** A process where every step belongs to one role wraps the same way as one spread across lanes.
- **A row that ends on a decision.** A decision whose outgoing paths land on the next row must still read as a decision, not as the end of the process.
- **A step wider than the row.** A step whose label is long enough to fill a row on its own must still be placed, not dropped.
- **A process with no connections at all.** Steps with nothing joining them still wrap and still sit in their lanes.
- **Wrapping that produces a very tall map.** A process long enough to need many rows must still fit the pack without being shrunk back into illegibility — there is a limit to how much a single page can hold, and the feature must say what happens at it.

## Requirements *(mandatory)*

### Functional Requirements

**Wrapping (User Story 1)**

- **FR-001**: The exported report's process map MUST place steps across multiple rows when placing them in one row would render them below a readable size.
- **FR-002**: The map MUST render every step exactly once, whatever the number of rows.
- **FR-003**: A process that fits one row MUST be rendered exactly as it is today, with no wrapping and no change in size or position.
- **FR-004**: The point at which the map begins to wrap MUST be determined by the printable width of the page and a defined minimum readable step size, not by a fixed step count.
- **FR-005**: The reading order MUST be unambiguous: a reader MUST be able to tell where one row ends and the next begins without guessing.

**Swimlanes (User Story 2)**

- **FR-006**: Every row MUST carry its own lanes, labelled, so a reader need not refer back to the first row to know whose lane a step is in.
- **FR-007**: Every step MUST appear in the lane of the role that performs it, on whichever row it lands.
- **FR-008**: The "Unassigned" lane MUST appear on any row containing a step with no role, and MUST NOT appear on rows that contain none.
- **FR-009**: A row MUST NOT reserve space for a lane that has no steps on that row.

**Connections (User Story 3)**

- **FR-010**: Every connection between two steps MUST be drawn, whether its steps land on the same row or different rows.
- **FR-011**: A connection whose steps land on different rows MUST be drawn so a reader can follow it, rather than as a straight line across intervening steps.
- **FR-012**: A connection's label MUST remain visible and attached to that connection when it crosses rows.
- **FR-013**: A step reached by more than one path MUST be drawn once, with each path reaching it.

**Leaving the interactive map alone (User Story 4)**

- **FR-014**: Rendering a wrapped map MUST NOT change any step's stored position.
- **FR-015**: The interactive Process Map MUST continue to render, pan and zoom exactly as it does now, unwrapped.
- **FR-016**: Wrapping MUST be decided at the moment the report is rendered, from the steps as they stand, and MUST NOT be stored.

**Fitting the pack**

- **FR-017**: A wrapped map MUST fit the space the report gives it. Where a process is long
  enough that even wrapping cannot keep every step above the readable size in that space,
  the map MUST fall back to today's behaviour — one rendering, shrunk to fit, complete —
  rather than overflow the page or drop a row.
- **FR-018**: The slide deck's process map MUST remain legible for a long process, by the same standard as the report.
- **FR-019**: The report's existing sections, their arrangement and their numbering MUST be unaffected; only the diagram inside the "Workflow diagram" block changes.

### Key Entities

- **Wrapped layout**: Where each step is drawn for one rendering of one process — its row, its lane within that row, and its position along that row. Derived at render time from the steps and the page width. Never stored.
- **Row**: One horizontal band of the wrapped map, carrying its own set of lanes and a contiguous run of the process.
- **Lane**: A role's band within a row. Present on a row only when that row has steps for it.
- **Stored position**: What a consultant arranged by hand on the interactive Process Map. Read by the wrapped layout to decide order, never written by it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A 22-step process in an exported pack is legible at printed size — a reader can read every step's label without magnification.
- **SC-002**: No step, connection or lane label is lost to wrapping: an exported map contains the same steps and connections as the process itself, 100% of the time.
- **SC-003**: A reader given a wrapped map can state the order of the steps correctly without being told how to read it.
- **SC-004**: For any step on any row, a reader can name the role responsible without scrolling back to another row.
- **SC-005**: A process short enough to fit one row produces an identical diagram to the one it produces today.
- **SC-006**: No consultant's hand-arranged step positions change as a result of exporting a report.

## Assumptions

- **Rows read left to right, top to bottom**, like text. It is the convention every reader already has, and the alternative — boustrophedon, alternating direction — saves a connector at the cost of a reader having to be told.
- **Order comes from the stored arrangement**, left to right then top to bottom, which is the order the interactive map already shows and the order the Steps List already uses. The wrap re-flows that order; it does not re-derive it from the connection graph.
- **A minimum readable step size exists and is fixed.** It is the point below which the map wraps rather than shrinks, and it is the same in the report and the deck.
- **Lanes are per row, not per map.** Repeating the lane labels on each row costs a little vertical space and saves a reader looking back, which is the right trade on a printed page where they cannot scroll.
- **The deck keeps its own layout.** The slide builder draws its own diagram rather than reusing the report's; it takes the same readability standard, not necessarily the same rendering.
- **Very long processes degrade to today's behaviour.** Wrapping buys a fixed amount of
  room; beyond it, the map shrinks to fit as it does now. Completeness is never traded for
  legibility — a shrunk map is a worse map, but a map missing a step is a wrong one. Which
  processes hit that limit is a question for the plan, not the spec.

## Out of Scope

- Wrapping the interactive Process Map, where panning and zooming already solve this and consultants arrange steps by hand.
- Re-deriving step order from the connection graph, or laying the map out automatically by any other rule than the order it is already in.
- Changing how a step, a lane or a connection looks — this feature decides where they go, not what they are.
- Splitting one process's map across two printed pages.
- The Helicopter View's rails, which had a genuine clipping bug and were fixed separately.
- Any change to the report's section arrangement, numbering, or which blocks appear.
