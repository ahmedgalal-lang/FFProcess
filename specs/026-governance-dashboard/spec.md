# Feature Specification: Governance Dashboard

**Feature Branch**: `026-governance-dashboard`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Backlog #13 — consolidated GRC dashboard." Confirmed with the user: per-workspace only, one client at a time on its Governance page. No firm-wide portfolio view.

> **Scope change 2026-09-29.** Specs 021–025 were withdrawn, so the panel's tiles cover risks, treatment actions, policies and the checklist only; the incident, vendor, conflict, training, privacy and ethics tiles in User Story 2 were removed with their registers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One summary of what needs attention (Priority: P1) 🎯 MVP

A consultant opening a client's Governance page today has to scroll through every register to work out what needs attention. They need a summary at the top that answers, at a glance, how many high risks are open, which policies are overdue for review, and how the checklist is progressing, with each figure linking to the records behind it.

**Why this priority**: The whole point of the feature, and it can be built from data that already exists today (risks, policies, checklist items), without waiting for any of the new registers.

**Independent Test**: On a workspace with open risks at different levels, one policy overdue for review, and a partly completed checklist, confirm the summary shows the correct counts, and that clicking each one takes you to those records.

**Acceptance Scenarios**:

1. **Given** a workspace, **When** a consultant opens its Governance page, **Then** a summary panel appears first showing: open risks by level (High, Medium, Low), published policies overdue for review, and checklist progress (done versus total, across every aspect).
2. **Given** any figure in the summary, **When** a consultant clicks it, **Then** they're taken to the records it counts (for example, the Risk Register filtered to open High risks).
3. **Given** a workspace with no governance data at all, **When** viewing the summary, **Then** it says nothing has been recorded yet, rather than showing a row of zeroes that looks like a clean bill of health.

---

### User Story 2 - The summary grows as each new register ships (Priority: P2)

As the other registers in this set are built (conflicts and training, vendors, incidents, privacy, ethics cases, risk treatments, checklist due dates), each adds its own attention-worthy figure to the same summary, so the dashboard stays the single place to look.

**Why this priority**: It keeps the dashboard complete over time, but each tile depends on its register existing first, so it's delivered incrementally rather than all at once.

**Independent Test**: For each register that has shipped, confirm its tile appears with the right count and links to its records. For each that hasn't, confirm no empty or broken tile appears.

**Acceptance Scenarios**:

1. **Given** the incident log exists (spec 024), **When** viewing the summary, **Then** it shows open incidents by severity, overdue corrective actions, and personal data breaches past their notification deadline.
2. **Given** the vendor register exists (spec 023), **When** viewing the summary, **Then** it shows vendors with overdue due diligence and contracts renewing within 60 days.
3. **Given** conflicts and training exist (spec 021), **When** viewing the summary, **Then** it shows open conflicts of interest and expired or expiring training.
4. **Given** the privacy register exists (spec 025), **When** viewing the summary, **Then** it shows special-category activities lacking an approved DPIA.
5. **Given** risk treatments (spec 027) and checklist due dates (spec 028) exist, **When** viewing the summary, **Then** it shows overdue treatment actions and overdue checklist items.
6. **Given** the ethics case register exists (spec 022), **When** a Workspace Admin views the summary, **Then** it shows open cases. **When** an Editor or Viewer views it, **Then** no ethics figure appears at all, not even a zero.
7. **Given** a register that hasn't been built yet, **When** viewing the summary, **Then** no tile appears for it.

---

### Edge Cases

- What does a Viewer see? The same summary as an Editor (every figure is read-only), except that ethics cases are Admin-only, per spec 022.
- What if a count is large? Tiles show the number, not a list. The list lives behind the link.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Governance page MUST open with a summary panel showing open risks by derived level, published policies overdue for review, and checklist progress across all aspects.
- **FR-002**: Every figure in the summary MUST link to the records it counts.
- **FR-003**: A workspace with no governance records MUST show an explicit "nothing recorded yet" state, not a set of zeroes.
- **FR-004**: As each of specs 021–025, 027 and 028 ships, its attention-worthy counts (as listed in User Story 2) MUST appear as tiles in the same panel, linking to their records.
- **FR-005**: Tiles for registers that don't exist yet MUST NOT appear.
- **FR-006**: Ethics case counts (spec 022) MUST appear only to Workspace Admins. Editors and Viewers MUST see no ethics tile at all, enforced on the server, not only hidden in the interface.
- **FR-007**: The summary MUST be readable by Viewers and above, and MUST be scoped to the one workspace being viewed. There is no cross-client view (confirmed with the user).

### Key Entities

- No new stored entities. Every figure is derived at view time from records other features already store.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can tell what needs attention in a client's governance area from one panel, without scrolling through each register.
- **SC-002**: Every figure is accurate at view time, with no stale cached counts.
- **SC-003**: No Editor or Viewer can learn the number of ethics cases through the dashboard.

## Assumptions

- Per-workspace only (confirmed with the user). A firm-wide portfolio view across clients is out of scope.
- No charts or trends over time in this version, only current counts. The heat map lives with the Risk Register (spec 027) rather than on this panel.
- No stored snapshots. Every figure is computed when the page loads.
