# Feature Specification: Connector Routing on the Process Map

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "i need to fix the process desplay for the process , lines are intersected and overlapped, build mockups for options" — followed, after review of three mockups, by "option A is good implement".

## Context

A Process Map draws step cards in swimlanes and connectors between them. Today every
connector is drawn the same way, turning at the same fixed distance from its card. Two
consequences are visible on any process larger than a handful of steps:

1. **Connectors sit on top of each other.** Two connectors leaving the same card, or
   running the same way between the same pair of lanes, are drawn along the same line for
   a long stretch. A reader cannot tell which arrow belongs to which pair of steps.
2. **Connectors run through step cards.** A connector between two distant steps is drawn
   straight across whatever lies between them, passing through the middle of cards it has
   nothing to do with — which reads, wrongly, as though those steps are on its path.

Measured on the mockup's eight-step sample, today's drawing produces **4 overlapping
pairs** and **9 connectors crossing a card**.

The chosen fix ("Option A") gives every connector that is not a short hop between
neighbours its own route: a horizontal line of its own inside the empty band between two
swimlanes, reached by a vertical of its own that no other connector leaving that card
shares.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A consultant reads a map and can follow every arrow (Priority: P1)

A consultant opens the Process Map for a process of twenty-odd steps with connectors
that skip columns and loop back. They want to trace, for any one step, where it goes
next and what feeds it. Today two arrows leaving the same card are drawn along the same
line and the trace is guesswork.

**Why this priority**: This is the defect the user reported, and the Process Map is the
product's primary artifact. A map whose arrows cannot be told apart fails at its only job.

**Independent Test**: Open the demo workspace's largest process map, pick a step with two
outgoing connectors, and follow each to its target. Both are separately visible along
their whole length.

**Acceptance Scenarios**:

1. **Given** a step with two or more outgoing connectors to non-adjacent steps, **When**
   the map is drawn, **Then** the two connectors are separated along their whole length —
   they never run along the same line for a distance a reader could mistake for one arrow.
2. **Given** two connectors that both pass through the band between the same pair of
   swimlanes, **When** the map is drawn, **Then** each runs on its own horizontal line
   within that band.
3. **Given** a connector between two steps that are neighbours — one column apart in the
   same swimlane — **When** the map is drawn, **Then** it is still drawn as the short
   direct line it is today, not detoured into a band.

---

### User Story 2 - No arrow passes through an unrelated step card (Priority: P1)

The same consultant reads a card that a long connector happens to pass over. Today the
arrow is drawn across the card's face, which reads as though that step is part of the
connector's path.

**Why this priority**: This is a correctness problem, not only a tidiness one — the map
asserts a relationship that does not exist. It is the same severity as US1 and shares
its implementation, so both are P1.

**Independent Test**: Render the demo workspace's largest process map and check every
connector against every card it neither starts nor ends at.

**Acceptance Scenarios**:

1. **Given** a connector between two steps that are not neighbours, **When** the map is
   drawn, **Then** the connector's path does not enter the interior of any step card
   other than its own two endpoints.
2. **Given** a connector that runs backward against the flow (a loop), **When** the map is
   drawn, **Then** it keeps its existing distinct appearance and also avoids crossing
   unrelated cards.

---

### User Story 3 - The printed report shows the same routing as the screen (Priority: P2)

A consultant exports the report to PDF and hands it to a client. The map in the PDF must
be the map they reviewed on screen, routed the same way.

**Why this priority**: The screen map is what gets fixed first and is where the defect was
reported; the printed map is the deliverable, so it cannot be left behind — but it is
worthless without US1 and US2, hence P2 rather than P1.

**Independent Test**: Open a process's map on screen and the same process in the exported
report, and compare the shape of each connector.

**Acceptance Scenarios**:

1. **Given** a process whose map routes connectors through the bands between lanes,
   **When** its report page is rendered, **Then** the same connectors take the same route.
2. **Given** a process whose map is wrapped onto several rows for print, **When** its
   report page is rendered, **Then** connectors are routed from where each step was
   actually placed by the wrap, not from its stored position.

---

### User Story 4 - Routing keeps up with edits (Priority: P3)

A consultant drags a step into a different lane, or draws a new connector. The map must
re-route immediately, not keep the arrangement computed when the page loaded.

**Why this priority**: The map is editable and a stale route is a visible bug, but it only
matters once routing exists at all.

**Independent Test**: Drag a step to a new lane on the live canvas and watch its
connectors.

**Acceptance Scenarios**:

1. **Given** a map already drawn, **When** a step is dragged to a new position, **Then**
   every connector touching it is re-routed to the new position without a page reload.
2. **Given** a map already drawn, **When** a new connector is drawn between two steps,
   **Then** it is routed by the same rules as the connectors already there, including
   taking its own line in a band another connector already occupies.

---

### Edge Cases

- **Two steps in the same lane and the same column.** There is no band "between" their
  lanes and no column gutter. The route must still be drawn and must still leave and
  enter its cards cleanly.
- **A band with more connectors than it has lines for.** The band between two lanes is
  finite. When more connectors want it than fit at the chosen separation, the routing
  must still place every one of them distinguishably rather than silently stacking two on
  the same line — the specific flaw the mockup called out as remaining.
- **A connector between adjacent lanes whose cards are unusually tall.** A decision card
  is taller than a task card, so the band between two lanes is narrower when a decision
  sits on either side of it. The corridor must fit the band that actually exists.
- **A connector whose two steps are in the same lane but many columns apart.** There is
  no band "between" one lane and itself; the route must use a band adjacent to that lane.
- **A connector with a label.** The label must stay on its own connector and stay legible
  — not land on top of a neighbouring connector now running parallel to it.
- **A process with a single step, or with no connectors at all.** Nothing to route; the
  map must draw exactly as it does today.
- **A connector spanning two rows of a wrapped print map.** These are already replaced by
  a pair of labelled stubs and must stay that way; routing must not resurrect them as
  drawn lines.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST decide each connector's route from the positions the steps
  are actually drawn at, and from the drawn size of each step card.
- **FR-002**: A connector between two steps that are neighbours — one column apart in the
  same swimlane — MUST be drawn as a direct line between them, unchanged from today.
- **FR-003**: Every other connector MUST be routed through the empty band between two
  swimlanes rather than across a lane's own cards.
- **FR-004**: Two connectors sharing a band MUST each be given a distinct line within it,
  far enough apart to be read as two arrows.
- **FR-005**: Two connectors leaving the same step card MUST leave it at distinct
  distances, so the stretch between the card and the band is not shared; likewise two
  connectors arriving at the same card.
- **FR-006**: When a band has more connectors than can be separated within it, the system
  MUST still give each a distinguishable route rather than placing two on one line.
- **FR-007**: A connector's path MUST NOT enter the interior of any step card other than
  the two it connects.
- **FR-008**: A connector running against the flow (a loop) MUST keep the distinct
  appearance it has today and MUST be routed by the same rules.
- **FR-009**: The routing MUST be identical on the live map and in the printed report for
  the same drawn positions.
- **FR-010**: The routing MUST be recomputed when a step moves or a connector is added or
  removed, without a page reload.
- **FR-011**: A connector's label MUST remain attached to and legible on its own
  connector.
- **FR-012**: A connector MUST remain selectable and deletable on the live map, and MUST
  keep the accessible description naming both of its endpoints.
- **FR-013**: The routing MUST leave the meaning of a connector unchanged — no connector
  may be added, removed, or re-pointed by it.

### Key Entities

- **Drawn step**: a step as it appears on the canvas — its centre position, its width and
  its height (which differ by step kind), and which swimlane and column it sits in.
- **Connector**: a directed link from one drawn step to another, with an optional label
  and a direction relative to the flow (forward or looping back).
- **Band**: the empty horizontal strip between two adjacent swimlanes, through which
  routed connectors run. Its height is what the cards on either side leave free.
- **Route**: the answer for one connector — which side of each card it leaves and enters,
  how far from each card it turns, and which line within which band it runs along.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a process map of at least twenty steps including column-skipping and
  looping connectors, **zero** connectors pass through the interior of a step card that
  is not one of their own two endpoints. (Today: 9 out of 9 sampled crossed a card.)
- **SC-002**: On the same map, **zero** pairs of connectors run along a shared line for a
  distance long enough to read as one arrow. (Today: 4 such pairs.)
- **SC-003**: Every connector on the same map remains traceable end to end: for each one,
  a continuous path from its source card to its target card exists and is separated from
  every other connector's path along its whole length.
- **SC-004**: The route computed for a given arrangement of steps and connectors is the
  same every time it is computed for that arrangement — the map does not redraw
  differently on reload.
- **SC-005**: The routes drawn in the exported report match the routes drawn on screen for
  the same process.
- **SC-006**: Moving a step produces re-routed connectors in the time it takes the card to
  land — no perceptible lag and no reload.
- **SC-007**: No connector, label, or arrowhead is drawn outside the map's own bounds.

## Assumptions

- "Neighbours" means one column apart in the same swimlane, as in the reviewed mockup;
  any other pair is routed.
- The band used by a connector spanning two lanes is the one below the upper of the two,
  as in the reviewed mockup.
- Connector separation within a band is a fixed distance chosen to be legible at the map's
  normal drawn size; it is not user-configurable.
- Step card sizes, lane height, and column spacing continue to come from the single shared
  source they come from today, so the router's bands and gutters stay correct if those
  sizes change.
- The wrapped print map's existing treatment of connectors that span two rows — replacing
  them with a pair of labelled stubs — is unchanged by this feature.
- No database schema change and no new user input are required.
