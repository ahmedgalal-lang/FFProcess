# Feature Specification: Printed Process Map Without Lane Bands

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "after deployment its very bad still" (screenshot of a
six-lane process map, most of each printed page empty) — followed, after review of a
mockup comparing four options, by "Option A — but this is applied for the report only,
the mapping in the process workspace should stay as is."

## Context

A wide process — many roles, not just many steps — prints badly. Every role a process
uses gets a full-height lane band on every printed row, whether or not that row's own
steps touch it, so a row of six steps spread across five roles is drawn five lanes tall
while never being more than one card tall in any column. On a 25-step, six-role process
this measured as **4 pages of map**, each page roughly a third blank below the last row
of cards.

The chosen fix ("Option A") drops the lane bands from the **printed report only**. A row
of cards is drawn as a single band, one card tall, instead of one band per role the row
touches. Each card already prints its own role name beneath its label — established
during exploration, this is not new — so no information is lost; what is lost is the
band that let a reader's eye run down a column and read "everything here is
Procurement" without looking at any one card. That trade is what the user accepted by
choosing Option A.

**Explicitly out of scope, by the user's own words:**
- The interactive Process Map (the live, editable canvas at
  `.../processes/[processId]/map`) keeps its swimlanes exactly as they are. It does not
  call the wrapping logic this feature changes at all — it is a separate, unwrapped
  rendering path — but is named here because it is the thing a reader would otherwise
  assume also changed.
- The PPTX slide-deck export uses the same underlying wrap function as the printed
  report. Nothing in the user's request mentions the slide deck, and it is a distinct
  deliverable with its own page economy (a 16:9 slide, not an A4 sheet), so it keeps its
  lane bands unless a later request says otherwise. This is a judgement call, recorded
  here as an assumption rather than silently applied.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A wide process's printed map fits on far fewer pages (Priority: P1)

A consultant exports a process that spans several roles. Today, every row of the printed
map reserves a band per role the whole process uses, so a six-role process's map runs
several pages, most of each one blank.

**Why this priority**: This is the defect reported, on a real production deployment,
after the map had already been fixed once this session for a different reason (crossed
connectors). It is the only reason this feature exists.

**Independent Test**: Export the report for a process that spans at least five roles
across at least twenty steps, and count the pages the map occupies before and after.

**Acceptance Scenarios**:

1. **Given** a process whose steps span several roles, **When** its report is exported,
   **Then** the printed map draws each row as a single band, one card tall, not one band
   per role the process uses.
2. **Given** the same process, **When** compared against today's drawing, **Then** the
   map occupies measurably fewer pages — not merely "less blank," but fewer whole pages.
3. **Given** a step's card, **When** it is printed, **Then** the step's role is still
   legible on the card itself, exactly as it is today.

---

### User Story 2 - The map is still readable and still says which row runs which way (Priority: P1)

Dropping the lane bands must not turn the printed map into an unlabelled scatter of
cards. A reader still needs to follow the flow, tell a forward row from a backward one,
and find their way from one row to the next.

**Why this priority**: A denser page that a reader can no longer follow is not a fix,
it's a different failure — this is the same severity as US1 because both together are
the actual deliverable.

**Independent Test**: Read a printed map end to end without the live canvas open beside
it, and confirm every step's order, direction and row-crossing is still legible from the
page alone.

**Acceptance Scenarios**:

1. **Given** a wrapped printed map, **When** it is read, **Then** the row label ("Row N
   of M · Steps a–b"), the backward-row notice, the rule between rows, the seam between
   rows that share a canvas, and the continuation markers for a connection crossing rows
   are all still drawn, unchanged from today.
2. **Given** two connectors that would previously have crossed under a lane band,
   **When** the row is drawn without bands, **Then** the connector routing built earlier
   this session still keeps every connector clear of cards it doesn't belong to.
3. **Given** a role whose steps are scattered across a row, **When** the row is drawn,
   **Then** nothing about the row's height or vertical position depends on which roles
   or how many roles that row's steps happen to use.

---

### User Story 3 - The live Process Map is untouched (Priority: P1)

The interactive canvas a consultant edits a process on must look and behave exactly as
it does today: full swimlane bands, one per role, unaffected by anything this feature
does to the printed report.

**Why this priority**: Explicitly demanded by the user. Changing the editing surface
would be a scope violation, not a bonus.

**Independent Test**: Open the interactive Process Map for the same process before and
after this feature ships and confirm the two are pixel-for-pixel the same rendering
logic (same swimlane bands, same node positions, same everything).

**Acceptance Scenarios**:

1. **Given** the interactive Process Map, **When** this feature ships, **Then** its
   swimlane rendering, lane assignment and node placement are unchanged — this feature
   touches no code path the live canvas uses.

---

### Edge Cases

- **A row that touches only one role.** Already exactly one card tall under today's
  lane-per-role rule; must still be one card tall without bands, so no regression on the
  common case where the change makes no visible difference.
- **A row mixing a decision and a task or terminal.** A decision is taller than a task.
  Without a lane grid to fall back on, the row's height must still fit its tallest card,
  and every card's vertical placement must still look intentional, not like cards of
  different heights bobbing at different baselines.
- **A short final row (fewer steps than the row capacity).** Must still align under the
  step the row above ended on, per the existing serpentine rule — unaffected by lanes,
  but worth confirming nothing about band removal disturbs the column alignment that
  makes the seam a straight drop.
- **A one-row process (nothing to wrap).** Must be left exactly as today: this feature
  changes only the *wrapped* rendering path.
- **A process with an Unassigned lane** (a step with no role at all). Its role name on
  the card was already "Unassigned"; nothing new here, but confirm it is not left off
  the card now that there is no lane to fall back on for the reader.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The printed report's wrapped process map MUST draw each row as a single
  band, sized to its tallest card, rather than one band per role the row's steps use.
- **FR-002**: A step's role MUST remain legible on its own printed card, unchanged from
  today, since the report no longer conveys role by which band a card sits in.
- **FR-003**: The row label, the backward-row notice, the rule between rows, the seam
  between two rows sharing a canvas, and the continuation markers for a connection that
  crosses rows MUST all continue to be drawn, unchanged in what they say.
- **FR-004**: Connector routing on the printed map MUST continue to keep every connector
  clear of cards it does not belong to, under the new row geometry.
- **FR-005**: A row's height MUST depend only on the tallest card it holds, never on how
  many distinct roles its steps happen to use.
- **FR-006**: The interactive Process Map (the live, editable canvas) MUST NOT be
  changed by this feature in any way — not its rendering, not any function it calls.
- **FR-007**: An unwrapped printed map (a process short enough that it fits one row)
  MUST be left exactly as it is today; this feature only changes the wrapped path.
- **FR-008**: The serpentine column alignment between consecutive rows (a row beginning
  directly beneath where the row above ended) MUST be unaffected by removing lane bands.

### Key Entities

- **Wrapped row (print only)**: today, a stack of per-role bands holding that row's
  steps. Under this feature, a single band holding the same steps, sized to the tallest
  one.
- **Lane band**: the per-role rectangle and name label drawn on a printed row today.
  Removed by this feature from the report's wrapped map; unchanged everywhere else
  (live canvas, PPTX export).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a process spanning at least five roles and twenty steps, the printed
  map's page count is measurably lower than before this feature, measured the same way
  as the earlier connector-routing work (rendered pages, not asserted numbers).
- **SC-002**: The same process's printed map shows zero connectors crossing a card that
  is not one of their own two endpoints — the guarantee the connector router already
  makes, now proven under the new row geometry.
- **SC-003**: Every step's role remains readable on its printed card in a rendered page,
  at a size no smaller than it is today.
- **SC-004**: The interactive Process Map's rendered output for a given process is
  byte-for-byte unaffected by this feature (no code path it uses is touched).
- **SC-005**: All existing wrapped-print-map behaviours — row labelling, direction
  notice, seam, continuation markers, serpentine alignment — remain true, verified by
  the existing test suite continuing to pass alongside new coverage for the six-role
  case that exposed this defect.

## Assumptions

- "The report" means the printed/exported report page
  (`app/reports/[workspaceId]/export-preview.tsx` and the static diagram it embeds,
  which is also what becomes the PDF). It does not include the PPTX slide-deck export,
  which shares the same underlying wrap function today but is a separate deliverable the
  user did not mention; the slide deck keeps its lane bands unless asked otherwise.
- Dropping lane bands does not require a new visual device (such as a colour flag) to
  compensate for the lost banding, because the printed card already carries its role
  name beneath its label today — confirmed by reading the component before writing this
  spec, not assumed from the mockup, which did add a colour flag as an illustration of
  one way to compensate but is not itself a requirement.
- No database schema change and no new user input are required; this is a rendering
  change to an existing print path.
