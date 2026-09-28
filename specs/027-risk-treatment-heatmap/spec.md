# Feature Specification: Risk Treatment Plans & Heat Map

**Feature Branch**: `027-risk-treatment-heatmap`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Backlog #4 — risk treatment plan (mitigation actions with owner, due date, status) per risk, plus a likelihood × impact heat map. Extends the existing Risk Register."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The risk heat map (Priority: P1) 🎯 MVP

The Risk Register today is a list. A consultant, and the client's board, need to see at a glance where risks cluster: a grid with likelihood on one axis and impact on the other, each cell showing how many open risks sit there, colored by overall severity. It's the single most recognizable picture in risk management.

**Why this priority**: It needs no new data (every risk already has a likelihood and an impact), so it delivers immediate, visible value with the least work.

**Independent Test**: With open risks spread across several likelihood and impact combinations (and one Closed risk), confirm each cell shows the correct count of open risks, the Closed one isn't counted, and clicking a cell filters the register to exactly those risks.

**Acceptance Scenarios**:

1. **Given** a workspace with risks, **When** viewing the Risk Register, **Then** a heat map appears with likelihood (Low, Medium, High) on one axis and impact (Low, Medium, High, Critical) on the other, each cell showing the number of risks that aren't Closed.
2. **Given** the heat map, **When** viewing a cell, **Then** it's colored by the overall level the product already derives for that combination (Low, Medium, High), and also labeled in text, so color is never the only signal.
3. **Given** a cell with risks in it, **When** a consultant clicks it, **Then** the register below filters to exactly those risks, with a clear way to clear the filter.
4. **Given** a workspace with no open risks, **When** viewing the register, **Then** the heat map shows an empty grid, not an error.

---

### User Story 2 - A treatment plan for each risk (Priority: P2)

Identifying a risk is half the job; the client also needs a decision about what to do about it (reduce it, transfer it, accept it, or avoid the activity) and, where it's being reduced, concrete actions with owners and deadlines.

**Why this priority**: This is what turns a register into a management tool, and it's the biggest gap in the current Risk Register beyond the visual.

**Independent Test**: Set a risk's treatment strategy to Mitigate, add two treatment actions (one overdue and open, one done), and confirm the risk shows its strategy, its actions, and one overdue action.

**Acceptance Scenarios**:

1. **Given** a risk, **When** an Editor sets its treatment strategy (Mitigate, Transfer, Accept, or Avoid) with a rationale, **Then** the risk shows that strategy.
2. **Given** a risk being mitigated, **When** an Editor adds a treatment action (what will be done, an owner being a role or person, and a due date), **Then** it's listed on the risk as Open.
3. **Given** a treatment action, **When** an Editor marks it Done, **Then** it records the completion date.
4. **Given** an open treatment action past its due date, **When** viewing the register, **Then** the risk is flagged as having overdue treatment actions.
5. **Given** a risk, **When** an Editor sets a target (residual) likelihood and impact, the level it should reach once treated, **Then** both current and target levels are shown on the risk.

---

### Edge Cases

- What happens to a risk's treatment actions when the risk is deleted? They're deleted with it.
- What happens to a regenerated assessment's effect on treatments? Nothing. A treatment strategy or action counts as a hand edit, so the risk is treated as hand-managed and a later regenerate never touches it, matching how the Risk Register already protects any risk a consultant has edited.
- What happens to the heat map when a risk is moved to Closed? It stops being counted.
- Does the heat map use a risk's target (residual) level? No, it plots current likelihood and impact only. Showing a second, residual heat map is a possible follow-up.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Risk Register MUST show a heat map with 3 likelihood rows and 4 impact columns, each cell counting the workspace's risks that aren't Closed.
- **FR-002**: Each cell MUST be colored by the overall level the product already derives for that likelihood and impact, and MUST also carry a text label, so the map is readable without color.
- **FR-003**: Clicking a non-empty cell MUST filter the register to exactly the risks it counts, with a visible way to clear the filter. The heat map MUST be operable by keyboard.
- **FR-004**: System MUST let an Editor set a risk's treatment strategy (Mitigate, Transfer, Accept, Avoid) with a rationale.
- **FR-005**: System MUST let an Editor add treatment actions to a risk, each with a description, owner (a role or a person), and due date; mark them Done; and delete them.
- **FR-006**: A risk with any open treatment action past its due date MUST be flagged in the register.
- **FR-007**: System MUST let an Editor set an optional target likelihood and impact for a risk, shown alongside its current level.
- **FR-008**: Setting a treatment strategy, target, or treatment action MUST mark the risk hand-managed, so a later assessment regenerate never overwrites it.
- **FR-009**: Treatment data MUST be workspace-scoped, readable by Viewers and above, and writable by Editors and above.

### Key Entities

- **Risk** (existing, extended): gains a treatment strategy, strategy rationale, and optional target likelihood and impact.
- **Treatment action**: one planned step to reduce a risk, with a description, owner, due date, and done date.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can see where a client's open risks cluster, by likelihood and impact, in one picture.
- **SC-002**: Every risk has a visible treatment decision once one is made, and every overdue treatment action is flagged without opening each risk.
- **SC-003**: The heat map passes the same automated accessibility checks as the rest of the Governance page, and can be read without relying on color.

## Assumptions

- The heat map's color bands reuse the existing risk-level derivation rather than introducing a new scoring model.
- The heat map lives on the Risk Register itself. The dashboard (spec 026) shows counts and links here.
- No risk appetite or tolerance thresholds in this version.
- No notifications for overdue treatment actions.
