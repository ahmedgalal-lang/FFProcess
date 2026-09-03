# Feature Specification: Process Map Documented Cards

**Feature Branch**: `002-process-map-cards`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "Redesign the Process Map diagram to 'Option B — Documented Cards' from the reviewed mockup, replacing the current small/cramped step boxes. Task cards show a step-number badge, title, owning role, and meta chips for SLA and cross-process hand-offs. Decision steps become a labelled gate card instead of a tiny diamond. Terminal steps become an emerald pill. Lanes grow to fit the bigger cards; the canvas height follows the lane count instead of being clamped. Edge routing/behavior is unchanged. This lands consistently across the live interactive Process Map, the printed/PDF Export Report, and the new PowerPoint export. User has already reviewed three mockup options side by side and chose this one."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a step without straining (Priority: P1)

A consultant opens a client's Process Map to walk through it with a stakeholder. Today, every step is a box smaller than the text used to describe it elsewhere in the app — nine steps across three lanes forces the whole diagram to shrink to fit a short, fixed-height canvas. The step cards need to be large enough that a step's name and role are readable at the diagram's normal (non-zoomed) scale, and the canvas needs to grow to fit however many lanes a process actually has, instead of squeezing everything into a fixed height.

**Why this priority**: This is the complaint that started the request ("looks bad and small") and is the foundation every other change sits on — a bigger canvas and bigger cards are needed before anything else on the card is worth adding.

**Independent Test**: Open any process with 3+ swimlanes on the Process Map. Every step's label and role are readable without zooming in, and the canvas is tall enough to show every lane without clipping or shrinking the content to fit.

**Acceptance Scenarios**:

1. **Given** a process with several swimlanes, **When** its Process Map is opened, **Then** the diagram canvas is exactly as tall as the number of lanes requires — it does not clip a lane and does not shrink the whole diagram down to fit a fixed box.
2. **Given** a step card on the diagram, **When** a viewer reads it at the diagram's default scale, **Then** the step's name and owning role are both legible without zooming in.

---

### User Story 2 - See a step's operational detail on the diagram itself (Priority: P2)

A step already carries a target turnaround time (its SLA) and, sometimes, a hand-off to another process — today both are visible on other pages (Governance, the Authority Matrix, the step's own link chip) but not glanceable on the map itself. A reader following the flow should be able to see, right on each step, whether it has an SLA target and where it hands off to, without leaving the page.

**Why this priority**: This is the reason the "documented cards" direction was chosen over the other two mockup options — it's what makes the bigger card worth its size, rather than just enlarging empty space.

**Independent Test**: Open a process that has at least one step with an SLA target and one step with a cross-process link. Both are visible directly on their respective cards, and a step with neither shows a plain, neutral indicator that none is set rather than an empty gap.

**Acceptance Scenarios**:

1. **Given** a step that has an SLA target set, **When** the Process Map is viewed, **Then** that step's card shows the SLA directly on it.
2. **Given** a step that links out to another process, **When** the Process Map is viewed, **Then** that step's card shows which process it hands off to.
3. **Given** a step with neither an SLA nor a hand-off, **When** the Process Map is viewed, **Then** the card shows a plain "not set" indicator rather than leaving a blank gap that looks unfinished.
4. **Given** a step's numbered position in its process, **When** the Process Map is viewed, **Then** that number is visible on the card.

---

### User Story 3 - Tell a decision apart from a task, with its threshold visible (Priority: P3)

Decision points (like an approval gate) are currently drawn as a tiny rotated diamond that only has room for a short label. A reader should be able to tell a decision step apart from a regular task at a glance, and see the condition that routes the flow (e.g., an approval threshold) without opening the Authority Matrix separately.

**Why this priority**: Decisions are the steps where a process most often needs a documented rule, but they're currently the hardest card to read. This depends on the bigger-card foundation from User Story 1.

**Independent Test**: Open a process with at least one decision step that has an approval threshold set. The decision reads visually distinct from task and terminal steps, and its threshold is visible on the card.

**Acceptance Scenarios**:

1. **Given** a decision step, **When** the Process Map is viewed, **Then** it is visually distinguishable from task and terminal steps at a glance (not just by its label).
2. **Given** a decision step with an approval threshold, **When** the Process Map is viewed, **Then** the threshold is shown on the card.

---

### User Story 4 - The same diagram everywhere it appears (Priority: P4)

A client-facing procedure document (the printed/PDF Export Report and the PowerPoint export) needs to draw the same process map a reader just saw live in the app. Today the interactive map, the static print/PDF version, and the PowerPoint version are three separate renderings that can drift apart. Once the card redesign ships, all three should draw the same step-card treatment, so a reader moving between the live app, a printed report, and a shared slide deck sees one consistent diagram, not three different ones.

**Why this priority**: Lowest priority because it's a rollout of an already-validated design to two more surfaces, not a new design decision — but it's necessary so the new look isn't just on-screen while the client-facing deliverables still show the old, cramped one.

**Independent Test**: Generate an Export Report PDF and a PowerPoint export for the same process shown live on the Process Map. All three show the same card layout, sizing proportions, and step-type treatment (allowing for each medium's own resolution/scale).

**Acceptance Scenarios**:

1. **Given** a process viewed live on the Process Map, **When** the same process is exported to the printed/PDF Export Report, **Then** the diagram uses the same card treatment (task cards, decision gate cards, terminal pills, taller lanes).
2. **Given** the same process, **When** it is exported to PowerPoint, **Then** the diagram slide uses the same card treatment as the live map and the PDF.

### Edge Cases

- A step with a very long name: the card must still show the full name legibly rather than cutting it off unreadably (wrapping is acceptable; silent truncation to an unreadable fragment is not).
- A process with a single lane, or a great many lanes: the canvas grows or shrinks to fit either case rather than assuming a "typical" number of lanes.
- A very wide process (many steps in sequence): the diagram is allowed to scroll horizontally, exactly as it does today — this feature does not change horizontal scrolling behavior.
- A loop-back connection (a step that returns to an earlier step): keeps reading as a loop (its current dashed, distinctly colored treatment), unchanged by this redesign.
- A step with a cross-process link **and** an SLA: both indicators appear on the same card without crowding each other unreadably.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Process Map diagram MUST display each task step as a card large enough for its name and owning role to be read without zooming in, replacing today's smaller box.
- **FR-002**: The Process Map diagram MUST display each step's position number (its order within the process) on the card.
- **FR-003**: The Process Map diagram MUST display a step's SLA target on its card when one is set for that step.
- **FR-004**: The Process Map diagram MUST display which process a step hands off to on its card when that step links to another process.
- **FR-005**: When a step has neither an SLA target nor a cross-process hand-off, the Process Map diagram MUST show a plain, clearly-labeled "not set" indicator on that card rather than leaving unexplained empty space.
- **FR-006**: The Process Map diagram MUST render a decision step as visually distinct from task and terminal steps, in a form roomy enough to also show its approval threshold when one is set.
- **FR-007**: The Process Map diagram MUST render a terminal step (Start/End) as visually distinct from task and decision steps.
- **FR-008**: The Process Map diagram's overall height MUST be determined by the number of swimlanes a process actually has, rather than being capped at a fixed height that shrinks the diagram to fit.
- **FR-009**: Swimlanes MUST remain visually distinguishable from one another (e.g., alternating tint) at the new, taller lane height.
- **FR-010**: The redesigned step-card treatment MUST appear consistently across all three places a process map is currently rendered: the live interactive Process Map, the printed/PDF Export Report, and the PowerPoint export.
- **FR-011**: All existing interactive behavior on the live Process Map (dragging a step to reorder it, dragging a step into a different lane, following a cross-process link chip, editing a step via the Steps List) MUST continue to work exactly as it does today — this feature changes how a step is drawn, not how the map is edited or what data it stores.
- **FR-012**: Connections between steps (including loop-back connections, which are visually distinguished from forward connections today) MUST keep their current routing and visual distinction; this feature does not change how connections are drawn or computed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person viewing any process's diagram at its default (non-zoomed) scale can read every step's name and role without zooming in, on a process with up to the largest swimlane count currently in use.
- **SC-002**: A reader can determine a step's SLA status (set, and to what, or not set) and hand-off target by looking at the diagram alone, without visiting the Governance page, the Authority Matrix, or the Steps List.
- **SC-003**: A reader can identify which steps are decision points, and their approval threshold where one exists, by looking at the diagram alone.
- **SC-004**: The same process's diagram, viewed live in the app, in a generated PDF report, and in a generated PowerPoint export, is recognizably the same design in all three places (same card shapes, same information shown per step type).
- **SC-005**: A process with a large number of swimlanes displays with no lane clipped and no forced shrinking below a legible size.

## Assumptions

- The SLA target and cross-process hand-off shown on a card are drawn from the same data already stored and shown elsewhere in the app (the step's own cross-process links, and the SLA already entered against that step in the Authority/RACI data) — no new data entry point is introduced by this feature.
- "Legible without zooming in" is judged at the diagram's normal default view, consistent with how the current interactive canvas already opens (fit-to-view), not at a forced 100% browser zoom.
- The three rendering surfaces (live canvas, printed/PDF, PowerPoint) are allowed to differ in exact pixel sizing and font-rendering technology, as each medium requires, as long as the same card shapes, layout logic, and information are used in all three.
- Existing print-safe minimum-zoom and page-fitting behavior for the PDF/report diagram is preserved — a wide or many-laned process still fits its printed page, just drawn with the new, larger card style at whatever scale that page-fit already requires.
- This feature does not change what step data can be entered or edited anywhere in the app (Steps List, step form, Authority/RACI pages) — it only changes how already-stored step data is drawn on the map.
