# Feature Specification: Incident & Issue Management

**Feature Branch**: `024-incident-management`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Backlog #11 — incident / issue management (severity, root cause, corrective action), distinct from the risk register."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Logging an incident and following it to resolution (Priority: P1) 🎯 MVP

A risk is something that *might* happen; an incident is something that *did*: a payment sent to the wrong account, a system outage, a safety near-miss, a control that failed. A consultant needs to log each incident, rate its severity, and follow it through to resolution, with a record of the root cause once it's understood.

**Why this priority**: Without an incident log, the client has no record of what actually went wrong, which is the evidence that tells them whether their risks and controls are working.

**Independent Test**: Log an incident, move it from Open to Investigating to Resolved (recording a root cause), then Closed. Confirm each step is kept and the log separates open incidents from closed ones.

**Acceptance Scenarios**:

1. **Given** a workspace, **When** an Editor logs an incident (a title, what happened, the date it occurred, a severity of Low, Medium, High, or Critical, a category, and optionally the process it happened in), **Then** it appears in the incident log as Open.
2. **Given** an open incident, **When** an Editor moves it to Investigating, then Resolved with a root cause recorded, then Closed, **Then** each step is kept.
3. **Given** the incident log, **When** viewing it, **Then** open incidents are listed before closed ones, most severe first, each showing how many days it has been open.
4. **Given** an incident logged by mistake, **When** an Editor deletes it, **Then** it's removed.

---

### User Story 2 - Corrective actions (Priority: P2)

Resolving an incident usually means changing something: a new control, a process fix, retraining. The consultant needs to attach corrective actions to an incident, each with an owner and a due date, and see which are overdue.

**Why this priority**: It turns an incident log into a record of improvement, but it only has value once incidents exist.

**Independent Test**: Add two corrective actions to an incident, one due yesterday and still open, one completed. Confirm the first is flagged overdue and the second isn't.

**Acceptance Scenarios**:

1. **Given** an incident, **When** an Editor adds a corrective action (what will be done, an owner being a role or a person, and a due date), **Then** it's listed on the incident as Open.
2. **Given** a corrective action, **When** an Editor marks it Done, **Then** it records the completion date.
3. **Given** an open corrective action whose due date has passed, **When** viewing the incident or the log, **Then** it's flagged Overdue.
4. **Given** an incident, **When** trying to close it while any of its corrective actions are still open, **Then** the system warns that open actions remain, but still allows closing (a corrective action can legitimately outlive the incident that prompted it).

---

### User Story 3 - Personal data breaches and the notification clock (Priority: P3)

Some incidents involve personal data: a leaked customer list, an email sent to the wrong recipients. Under GDPR and similar laws, the client typically has 72 hours from becoming aware of such a breach to notify the regulator. The consultant needs to flag those incidents and see the deadline counting down.

**Why this priority**: Legally significant when it applies, but it applies to a subset of incidents, and the log is fully useful without it.

**Independent Test**: Log an incident flagged as a personal data breach with an awareness time 60 hours ago. Confirm it shows 12 hours remaining to notify. Record the regulator notification, and confirm the countdown is replaced by the notification date.

**Acceptance Scenarios**:

1. **Given** an incident, **When** an Editor flags it as involving personal data and records when the client became aware of it, **Then** it shows the regulator-notification deadline (72 hours after awareness) and the time remaining.
2. **Given** a flagged incident past its deadline with no notification recorded, **When** viewing the log, **Then** it's flagged Notification overdue.
3. **Given** a flagged incident, **When** an Editor records that the regulator was notified (and when), or that notification wasn't required (with a reason, for example a low risk to individuals), **Then** the countdown is replaced by that record.

---

### Edge Cases

- What happens to an incident's linked process if that process is deleted? Processes are archived, not deleted, in this app: the incident keeps the link, shown as "(archived)", and an archived process can't be newly linked. Only a hard delete clears the link, and the incident stays.
- What happens to corrective actions when their incident is deleted? They're deleted with it.
- Can an incident be linked to a risk on the Risk Register? Yes, optionally, one or more, so a risk that materialized can be traced to the incident. Deleting either side removes only the link.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let an Editor log, edit, and delete incidents, each with a title, description, date occurred, severity (Low, Medium, High, Critical), category (Operational, Financial, IT & security, Health & safety, Compliance, Other), and optional related process.
- **FR-002**: Incidents MUST move through Open, Investigating, Resolved, and Closed. Moving to Resolved MUST require a root cause.
- **FR-003**: The incident log MUST list open incidents before closed ones, most severe first, each showing days open.
- **FR-004**: System MUST let an Editor add corrective actions to an incident, each with a description, owner (a role or a person), and due date, and mark each Done.
- **FR-005**: An open corrective action past its due date MUST be flagged Overdue.
- **FR-006**: Closing an incident with open corrective actions MUST show a warning but MUST still be allowed.
- **FR-007**: System MUST let an Editor flag an incident as a personal data breach, record the awareness time, and see the regulator-notification deadline (awareness plus 72 hours) and time remaining.
- **FR-008**: A flagged incident past its deadline with no notification decision recorded MUST be flagged Notification overdue.
- **FR-009**: System MUST let an Editor record either that the regulator was notified (with date) or that notification wasn't required (with a reason).
- **FR-010**: System MUST let an Editor link an incident to one or more risks on the same workspace's Risk Register. Deleting either side MUST remove only the link.
- **FR-011**: Incidents MUST be workspace-scoped, readable by Viewers and above, and writable by Editors and above.

### Key Entities

- **Incident**: something that went wrong, with its title, description, date, severity, category, status, root cause, optional process, and, if it involves personal data, the breach awareness time and notification record.
- **Corrective action**: a change to be made because of an incident, with a description, owner, due date, and done date.
- **Incident–risk link**: an association between an incident and a risk on the same workspace's Risk Register.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every incident a consultant logs can be followed to a closed state with a recorded root cause.
- **SC-002**: Every overdue corrective action and every personal data breach past its notification deadline is visibly flagged in the log without opening each incident.
- **SC-003**: A consultant can trace a risk on the Risk Register to the incidents where it actually happened.

## Assumptions

- The 72-hour window follows GDPR Article 33. Other jurisdictions' windows aren't configurable in this version.
- Personal data breaches live here as flagged incidents. The Data Privacy module (spec 025) links to them rather than keeping a second breach register.
- No notifications or reminders for deadlines.
- No file attachments.
