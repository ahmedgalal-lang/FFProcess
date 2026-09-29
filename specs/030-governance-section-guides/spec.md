# Feature Specification: Governance Section Guides

**Feature Branch**: `030-governance-section-guides`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "Next to each sector in the governance add an information icon that pops up information about this sector, why it's important, how to create and fill it, and how to evaluate the results. Build a mockup first." The mockup (artifact "Governance Section Guides") was approved as-is.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reading a section's guide (Priority: P1) 🎯 MVP

A consultant, or a client reading alongside them, meets a section of the Governance page they don't fully understand, such as the Risk register or the governing policy. They need a short, practical explanation on the spot: why the section matters, how to fill it in, and how to tell whether the result is good.

**Why this priority**: It's the whole feature.

**Independent Test**: Click the ⓘ next to "Risk register". A guide opens with three tabs (Why it matters, How to fill it in, How to evaluate it). The last tab lists good signs and warning signs. Esc closes it and returns focus to the ⓘ.

**Acceptance Scenarios**:

1. **Given** the Governance page, **When** a reader looks at a section heading, **Then** an ⓘ button sits next to it, named "About <section>".
2. **Given** an ⓘ button, **When** it's clicked or activated from the keyboard, **Then** that section's guide opens beside it, showing a one-line description and the "Why it matters" tab.
3. **Given** an open guide, **When** the reader picks "How to fill it in" or "How to evaluate it" (by click or arrow keys), **Then** that content shows. "How to evaluate it" lists good signs and warning signs side by side.
4. **Given** an open guide, **When** the reader presses Esc, clicks ×, or clicks elsewhere, **Then** it closes; Esc and × return focus to the ⓘ.
5. **Given** one guide open, **When** another ⓘ is clicked, **Then** the first closes and the second opens.

### Edge Cases

- Guides are the same for every workspace and every access level; a Viewer sees them too.
- On a phone-width screen the guide fits the screen width rather than overflowing it.
- Guides don't change what's on the page: no records are read or written.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every section of the Governance page MUST have an ⓘ button next to its heading: What needs attention, Governance profile, Governance assessment, Governing policy, Governance checklist, Risk register, Policy library, Activity, and Key Control Points & KPIs.
- **FR-002**: Each guide MUST show the section's name, a one-line description, and three tabs: Why it matters, How to fill it in (ordered steps), and How to evaluate it (good signs and warning signs), with a reference to the relevant standard or law where one applies.
- **FR-003**: Guides MUST be keyboard operable and announced as dialogs, with visible focus, and MUST close on Esc, ×, or a click outside.
- **FR-004**: Only one guide MUST be open at a time.
- **FR-005**: The text MUST be the approved mockup's, updated only where the page has changed since (the governing policy section).

### Key Entities

- **Section guide**: fixed product text for one Governance section: title, description, why, steps, good signs, warning signs, optional reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every Governance section has a guide reachable in one click or keypress.
- **SC-002**: The guides pass automated accessibility checks when open.

## Assumptions

- Guide text is product copy maintained in the code, not editable per workspace.
- English only, like the rest of the product.
