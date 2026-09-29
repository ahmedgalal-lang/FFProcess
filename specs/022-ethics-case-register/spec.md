# Feature Specification: Ethics & Whistleblower Case Register

**Feature Branch**: `022-ethics-case-register`

**Created**: 2026-09-28

**Status**: Withdrawn

**Input**: User description: "Backlog #9 — whistleblower / ethics intake." Confirmed with the user: a confidential case register that consultants fill in from reports the client received through its own channels, not an anonymous public form; visible to Workspace Admins only.

> **Withdrawn 2026-09-29.** Built, then removed at the client's request: the Governance area keeps the policies that govern each aspect rather than operational registers. The code, tables and tests were deleted (migration `remove_operational_registers`); this spec and the implementation in git history remain as a record.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Logging and triaging a report (Priority: P1) 🎯 MVP

A client's hotline, ethics mailbox, or HR team receives a report of possible misconduct: fraud, harassment, a bribery concern. The consultant helping run the client's governance needs to log it somewhere confidential, record how it came in, and triage it (category, severity) so it doesn't sit forgotten in someone's inbox.

**Why this priority**: A case that isn't logged can't be tracked at all. This is the foundation everything else in the register builds on.

**Independent Test**: As a Workspace Admin, log a case with its channel, date received, category, severity, and a description, and confirm it appears in the register as New. As an Editor on the same workspace, confirm the register isn't visible at all.

**Acceptance Scenarios**:

1. **Given** a Workspace Admin, **When** they log a case (the date it was received, how it came in, a category, a severity, and a description of the allegation), **Then** it appears in the case register with status New and an automatically assigned case reference.
2. **Given** a case, **When** an Admin records whether the reporter chose to stay anonymous, **Then** that is shown on the case, and no reporter identity field is offered for an anonymous report.
3. **Given** an Editor or Viewer on the same workspace, **When** they open the Governance page, **Then** the case register doesn't appear, and a direct request for any case is refused by the server, not just hidden in the interface.

---

### User Story 2 - Investigating and closing a case (Priority: P2)

Once triaged, a case moves through investigation to an outcome. The consultant needs to record who's investigating, keep dated notes as it progresses, and close it with a recorded outcome (substantiated, partially substantiated, unsubstantiated) so the client can later show every report was dealt with.

**Why this priority**: Logging (User Story 1) alone already gives the client a record. Following each case to a documented close is what makes the register defensible to an auditor or regulator.

**Independent Test**: Take a logged case through Triaged, Under investigation (with an assigned investigator and two dated notes), and Closed (with an outcome), and confirm each step and note is kept in order.

**Acceptance Scenarios**:

1. **Given** a New case, **When** an Admin moves it to Triaged, then Under investigation, and assigns an investigator (a person in the directory, or a free-text name for someone outside the client such as external counsel), **Then** each change is kept.
2. **Given** a case under investigation, **When** an Admin adds a dated investigation note, **Then** it's appended to the case's notes in order. Notes can't be edited or deleted afterward, so the investigation record stays intact.
3. **Given** a case, **When** an Admin closes it, **Then** they must record an outcome (Substantiated, Partially substantiated, Unsubstantiated, or Referred elsewhere) and a closing summary.
4. **Given** the register, **When** viewing it, **Then** open cases are clearly separated from closed ones, and each shows how many days it has been open.

---

### Edge Cases

- What happens if an Admin tries to delete a case? It can't be deleted once it's been triaged. A New case logged by mistake can be deleted, but anything that has started an investigation is permanent, because a deleted whistleblower case is exactly what an auditor would ask about.
- What happens to a case if its investigator, a person in the directory, is later removed? The case stays, and the investigator field falls back to the name they had at the time.
- What happens when a Firm Owner opens the workspace? They see the register, since the Firm Owner carve-out already grants Admin access to every workspace.
- What happens in the exported report pack? Cases never appear in any export, even with every section turned on.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let a Workspace Admin log a case with the date received, intake channel (Hotline, Email, In person, Manager referral, Other), category (Fraud, Bribery & corruption, Harassment & discrimination, Health & safety, Conflict of interest, Data misuse, Other), severity (Low, Medium, High, Critical), and a description.
- **FR-002**: Every case MUST receive a unique, human-readable reference within its workspace (e.g. "CASE-0007"), assigned automatically.
- **FR-003**: Each case MUST record whether the reporter asked to remain anonymous. When anonymous, the system MUST NOT offer a field for the reporter's identity.
- **FR-004**: A case MUST move through New, Triaged, Under investigation, and Closed, with an assignable investigator (a person from the directory, or a free-text name).
- **FR-005**: Admins MUST be able to append dated investigation notes to a case. Notes MUST NOT be editable or deletable once saved.
- **FR-006**: Closing a case MUST require an outcome (Substantiated, Partially substantiated, Unsubstantiated, Referred elsewhere) and a closing summary.
- **FR-007**: A case MUST be deletable only while New. Once triaged it is permanent.
- **FR-008**: The register and every case in it MUST be readable and writable only by Workspace Admins (including a Firm Owner through the existing carve-out), enforced on the server for every read and write. Editors and Viewers MUST NOT see the register or learn that any case exists.
- **FR-009**: Cases MUST NOT appear in any report export, the governance activity feed (spec 019), or any dashboard count visible to non-Admins.

### Key Entities

- **Ethics case**: one reported concern, with a reference, date received, channel, category, severity, anonymity flag, optional reporter identity (when not anonymous), description, status, investigator, and outcome with closing summary once closed.
- **Case note**: one dated, append-only investigation note on a case, attributed to the Admin who wrote it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every case the client receives can be logged, followed to closure, and shown to have a documented outcome.
- **SC-002**: Zero ways for an Editor or Viewer to see a case's existence, content, or count, whether through the interface, a direct request, an export, or the activity feed.
- **SC-003**: A triaged case's history (its notes and its existence) can't be erased through the app.

## Assumptions

- No public or anonymous submission form: reports reach the client through its own channels and a consultant logs them (confirmed with the user). A public intake link is a possible follow-up, but it would add an internet-facing, unauthenticated form, which needs its own security design.
- No notifications to investigators or reporters.
- No file attachments (evidence uploads) in this version, since storing sensitive documents raises its own retention and access questions. Descriptions and notes are text only.
- Case numbering is per workspace and never reused, even after a New case is deleted.
