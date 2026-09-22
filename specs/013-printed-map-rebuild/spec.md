# Feature Specification: Printed Process Map, Rebuilt

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-22

**Status**: Draft

**Input**: "this should not be like this, i think we should rebuild this part from scratch"
— reported against the process map as it prints in the Export Report, with a screenshot of
an 18-step tender process.

## Context: what is wrong today

The printed map tries to preserve a left-to-right flowchart on a page too narrow to hold
it, by dealing the steps into rows and shrinking the cards until they fit. Everything else
it does is a patch on that one decision:

- rows alternate direction, so every other row runs **right to left**;
- each row carries a label saying which row it is and which way it runs;
- a connection the wrap cannot draw is replaced by a **pair of markers** ("continues on
  row 4" / "from row 3") that the reader has to match up by eye;
- a short **stub** is drawn beside each marker;
- a teal **seam** is drawn between row groups to stand in for the one connection that
  crosses a page break.

A reader ends up reconstructing the flow from annotations instead of following a line.

These are the measurements from the reported shape, rebuilt as a fixture
(`tests/fixtures/tender-process.ts` — 18 steps, 4 roles, two decisions that each fork):

| Measured | Today |
|---|---|
| Step cards whose label text overflows the card box | **18 of 18** |
| Cards drawn past the edge of the box containing them | 1 |
| Row labels drawn on top of a connector line | 1 |
| Link stubs drawn >120px from any card, pointing into empty page | 1 |
| Rows, and how many of them run right-to-left | 4 rows, 2 backwards |
| Pages in the exported PDF | 7 |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every step on the printed map can actually be read (Priority: P1)

A consultant exports the report for a client and hands it over — on paper, or as a PDF the
client reads on screen. Every step on the map shows its full label, its role, and whatever
else the card carries. Nothing is cut off mid-word, nothing is hidden behind the edge of a
box, and the client does not have to open the app to find out what a step says.

**Why this priority**: this is the defect that makes the current map worthless as a
deliverable. A map whose every card is truncated communicates nothing, however elegantly
it is laid out. Fixing only this already produces a map a consultant can send to a client.

**Independent Test**: export the report for the 18-step fixture and measure every card's
rendered text against its box. Zero overflow, zero clipping — testable with no other part
of this feature built.

**Acceptance Scenarios**:

1. **Given** a process whose step labels run to a full sentence (e.g. "Internal resources
   evaluation and needs (e.g.; Hr, staffing, salaries, etc..)"), **When** the report is
   exported, **Then** that step's card shows the whole label, with no truncation and no
   text overflowing the card's own bounds.
2. **Given** any step on any process in the report, **When** the report is exported,
   **Then** no part of its card is clipped by the edge of the region the map is drawn in.
3. **Given** a process with steps of very different label lengths, **When** the report is
   exported, **Then** every card is sized to hold what it carries rather than every card
   being sized alike and the longest being cut.

---

### User Story 2 - The order of the steps is obvious without instructions (Priority: P1)

A consultant, or their client, follows the process from its first step to its last without
being told which direction to read. No row announces that it runs right to left; no reader
has to hold a row number in their head to know where the flow goes next.

**Why this priority**: equal-first with US1. A legible card that sits in an unreadable
sequence still fails the deliverable. Together these two are the MVP — a map that can be
read, in the right order.

**Independent Test**: export the fixture and confirm that consecutive steps always advance
in one consistent direction, and that nothing in the drawing exists to explain a direction
reversal, because there are none.

**Acceptance Scenarios**:

1. **Given** a process of any length, **When** the report is exported, **Then** step *n+1*
   is always found in the same direction from step *n*, for every *n*.
2. **Given** a process long enough to need more than one page, **When** the report is
   exported, **Then** no part of the drawing carries a warning about reading direction,
   because no part of it reverses.
3. **Given** a reader who starts at the first step, **When** they follow the drawn
   connections, **Then** they reach the last step without needing to match a marker to a
   partner elsewhere on the page.

---

### User Story 3 - Connections are drawn, not annotated (Priority: P2)

Where two steps are connected, a line joins them. The reader follows lines, not pairs of
labels. Where a connection genuinely cannot be drawn — because its two ends fall on
different pages — what stands in for it says unambiguously which step it goes to, in which
direction, and carries its own label rather than one borrowed from a different connection.

**Why this priority**: the marker pairs are the most confusing thing on the current map
after the truncation, and one of them currently displays a label belonging to a different
connection entirely. But a map that reads correctly in order (US1+US2) is already
deliverable, so this follows them.

**Acceptance Scenarios**:

1. **Given** two connected steps that both appear on the same page, **When** the report is
   exported, **Then** a line is drawn between them.
2. **Given** a connection whose two ends fall on different pages, **When** the report is
   exported, **Then** the reader is told which step it continues to and in which
   direction, without ambiguity.
3. **Given** a connection that carries a label (e.g. "Yes", "Locally"), **When** it cannot
   be drawn as a line, **Then** whatever stands in for it carries **that** connection's
   label and never another connection's.
4. **Given** any step, **When** the report is exported, **Then** nothing is drawn beside it
   that points into empty space.

---

### User Story 4 - A branch reads as a branch (Priority: P2)

A decision step with more than one outgoing path shows those paths separating at the
decision and going their own ways. Neither path is drawn sweeping across the page
underneath unrelated steps.

**Why this priority**: branching is what distinguishes a process map from a numbered list,
and the fixture's two forks (Yes/No, Locally/Internationally) are ordinary shapes in a
consulting process. But a straight-through process is still readable without this, so it
sits below the ordering work.

**Acceptance Scenarios**:

1. **Given** a decision step with two outgoing connections, **When** the report is
   exported, **Then** both are drawn leaving that step, each carrying its own label.
2. **Given** a decision whose two branches later converge on one step, **When** the report
   is exported, **Then** both incoming connections are visible at the step they converge
   on.
3. **Given** any connector on the map, **When** the report is exported, **Then** it does
   not pass through or across a step card it does not connect.

---

### Edge Cases

- **A process with one step, or none.** The map must render something sensible rather than
  an empty framed box or an error.
- **A step label far longer than any card should be** — a consultant pasting a paragraph
  into a label. The card cannot grow without bound; there must be a defined, documented
  limit to how much is shown, and it must not silently cut mid-word.
- **A process where every step has the same role, and one where every step has a different
  role.** Both must lay out sensibly.
- **A step with no role at all.** It must still appear, and still say that no role is set.
- **A connection from a step back to an earlier step** (a rejection loop). It must be
  distinguishable from a forward connection.
- **A connection between two steps many pages apart.**
- **A process long enough that the map spans several pages.** The break must fall where it
  costs the reader nothing.
- **A process whose steps a consultant has dragged into a hand-arranged layout on the
  interactive canvas.** The printed map must not be thrown by positions that disagree with
  step order, and must not write those positions back.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The printed map MUST show every step of the process, exactly once.
- **FR-002**: Every step's card MUST display its full label without truncation and without
  text overflowing the card's own bounds.
- **FR-003**: Every step's card MUST show the role responsible for it, or state explicitly
  that no role is set.
- **FR-004**: No card, label, marker or connector may be clipped by the edge of the region
  the map is drawn in.
- **FR-005**: The steps MUST be laid out so that consecutive steps always advance in one
  consistent direction, for the whole map.
- **FR-006**: The map MUST NOT need to tell the reader which direction to read it.
- **FR-007**: A connection between two steps that appear on the same page MUST be drawn as
  a line between them.
- **FR-008**: A connection that cannot be drawn as a line MUST be represented in a way that
  states which step it reaches and in which direction.
- **FR-009**: Anything standing in for a connection MUST carry that connection's own label,
  and MUST NOT display a label belonging to any other connection.
- **FR-010**: Nothing may be drawn adjacent to a step that does not lead somewhere — no
  stub, arrow or marker pointing into empty space.
- **FR-011**: A connector MUST NOT be drawn across or through a step card it does not
  connect.
- **FR-012**: A decision step's outgoing connections MUST each be drawn leaving it,
  each with its own label where the connection has one.
- **FR-013**: A connection running backwards in the process (to an earlier step) MUST be
  visually distinguishable from one running forwards.
- **FR-014**: The map MUST fit the printable width of the report's page, and where it
  spans several pages, MUST break only between whole steps — never through a card.
- **FR-015**: Rendering the report MUST NOT alter any stored step position, ordering or
  other process data.
- **FR-016**: The map MUST render sensibly for a process with one step, and for one with
  no steps at all.
- **FR-017**: Where a step's label is longer than the map can reasonably show, the amount
  shown MUST be bounded by a documented limit and MUST NOT cut mid-word.

### Key Entities

- **Step**: one box on the map — carries a label, the role responsible, its position in the
  process order, and whether it is a start, an ordinary task, a decision, or an end.
- **Connection**: a link from one step to another, optionally labelled (e.g. "Yes",
  "Locally"), which the map draws as a line or, when it cannot, represents some other way.
- **Process**: the ordered set of steps and the connections between them, belonging to one
  workspace.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the 18-step tender fixture, **zero** of the step cards have text
  overflowing their bounds — down from 18 of 18 today.
- **SC-002**: **Zero** cards, labels, markers or connectors are clipped by the region the
  map is drawn in — down from 1 today.
- **SC-003**: **Zero** parts of the drawing tell the reader which direction to read, because
  no part of the map reverses direction — down from 2 of 4 rows running backwards today.
- **SC-004**: **Zero** stubs, arrows or markers are drawn pointing into empty space — down
  from 1 today.
- **SC-005**: **Zero** connectors are drawn across a step card they do not connect.
- **SC-006**: Every connection in the fixture is either drawn as a line, or represented by
  something that names its own destination and carries its own label — with **zero**
  connections silently dropped, and **zero** labels shown against a connection they do not
  belong to.
- **SC-007**: A reader given the exported PDF and no other instruction can follow the
  process from first step to last, and can say for each decision what its branches are.
- **SC-008**: The map still renders for every process already in the product — including
  hand-arranged ones — with no stored step position changed by exporting.

## Assumptions

- **The reader's page is A4 landscape**, which is what the report already prints, and the
  map has the same printable width as every other section of the pack.
- **Page count is not itself a success criterion.** A rebuild that makes the map longer but
  readable is a better deliverable than today's 7 pages of unreadable map. A specific page
  budget would prejudge the layout, which is a planning decision.
- **The layout approach is deliberately not specified here.** Whether the rebuilt map flows
  down the page, across it, in role columns, or some other arrangement is a design decision
  for the planning phase, to be chosen against these outcomes.
- **The interactive Process Map canvas is out of scope**, as the consultant has already
  said it should stay as it is. Only the report's rendering changes.
- **The PPTX deck's map is out of scope** unless the plan finds it can safely share the
  rebuilt layout; a slide is a different shape from a page and may not want the same
  answer.
- **Existing behaviour that already works is kept**: the map is read-only in the report,
  cross-process links continue to be shown on the cards that carry them, and the report's
  own pagination rules continue to apply.
