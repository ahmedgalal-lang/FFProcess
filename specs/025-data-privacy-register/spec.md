# Feature Specification: Data Privacy Register

**Feature Branch**: `025-data-privacy-register`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Backlog #12 — data privacy module (data inventory, DPIAs, breach register)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A record of processing activities (Priority: P1) 🎯 MVP

Most privacy laws (GDPR Article 30 being the best-known) expect an organization to keep a record of what personal data it processes, why, on what legal basis, who it's shared with, and how long it's kept. A consultant needs to build that record for the client, activity by activity, such as payroll, customer marketing, or CCTV.

**Why this priority**: The processing record is the foundation of any privacy programme and the first thing a regulator asks for. DPIAs and breach tracking both refer back to it.

**Independent Test**: Record two processing activities with their purpose, lawful basis, data categories, retention, and recipients. Confirm both appear in the register with every field kept.

**Acceptance Scenarios**:

1. **Given** a workspace, **When** an Editor records a processing activity (its name, purpose, lawful basis, the categories of people and of personal data involved, recipients or processors, retention period, and optionally the process it belongs to and a responsible role or person), **Then** it appears in the processing register.
2. **Given** an activity, **When** an Editor marks it as involving special-category data (for example health or biometric data), **Then** it's visibly flagged, since such activities usually carry extra obligations.
3. **Given** an activity that sends data outside the client's jurisdiction, **When** an Editor records the destination and the safeguard relied on (for example standard contractual clauses), **Then** it's shown on the activity.
4. **Given** an activity, **When** an Editor edits or deletes it, **Then** the change is kept or it's removed.

---

### User Story 2 - Data protection impact assessments (Priority: P2)

Higher-risk processing (large-scale special-category data, systematic monitoring, new technology) needs a documented impact assessment. The consultant needs to record a DPIA against a processing activity, capture its conclusions, and track it to sign-off.

**Why this priority**: Important where it applies, but only for a subset of activities, and it depends on User Story 1's register existing.

**Independent Test**: Start a DPIA on a special-category activity, record the risks identified and the mitigations, set the residual risk, and move it to Approved. Confirm the activity shows it has a completed DPIA.

**Acceptance Scenarios**:

1. **Given** a processing activity, **When** an Editor starts a DPIA for it (describing the risks to individuals, the planned mitigations, and a residual risk of Low, Medium, or High), **Then** the DPIA is linked to the activity as Draft.
2. **Given** a DPIA, **When** an Admin approves it and records the date, **Then** it shows as Approved with that date.
3. **Given** an activity flagged as special-category with no approved DPIA, **When** viewing the register, **Then** it's flagged DPIA recommended.
4. **Given** a DPIA with residual risk High, **When** viewing it, **Then** it's flagged as possibly needing consultation with the regulator before the processing goes ahead.

---

### User Story 3 - Seeing privacy breaches alongside the register (Priority: P3)

Breaches are already logged as incidents flagged "personal data involved" (spec 024). The privacy area should show those breaches too, and let each be linked to the processing activity it affected, so a consultant can see a complete privacy picture in one place.

**Why this priority**: It rounds out the privacy view but builds no new tracking: breaches keep living in the incident log.

**Independent Test**: With a personal data breach incident logged, confirm it appears in the privacy area's breach list. Link it to a processing activity and confirm the activity lists it.

**Acceptance Scenarios**:

1. **Given** incidents flagged as personal data breaches, **When** viewing the privacy area, **Then** they're listed with their notification status (from spec 024), not duplicated as separate records.
2. **Given** a breach incident, **When** an Editor links it to one or more processing activities, **Then** each activity lists the breach.

---

### Edge Cases

- What happens to an activity's DPIAs when the activity is deleted? They're deleted with it, and the confirmation says so.
- What happens to a breach link when either the incident or the activity is deleted? Only the link is removed.
- What if spec 024 (incidents) hasn't been built when this one is? User Stories 1 and 2 don't depend on it. User Story 3 waits for spec 024.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let an Editor add, edit, and delete processing activities, each with a name, purpose, lawful basis (Consent, Contract, Legal obligation, Vital interests, Public task, Legitimate interests), data-subject categories, personal-data categories, recipients or processors, retention period, and optional process link and responsible role or person.
- **FR-002**: An activity MUST support a special-category flag and optional international-transfer details (destination and safeguard).
- **FR-003**: System MUST let an Editor create a DPIA linked to a processing activity, with the risks identified, mitigations, and residual risk (Low, Medium, High), starting as Draft.
- **FR-004**: Approving a DPIA MUST be Admin-only and MUST record the approval date and approving user.
- **FR-005**: A special-category activity without an approved DPIA MUST be flagged DPIA recommended. A DPIA with High residual risk MUST be flagged as possibly requiring prior regulator consultation.
- **FR-006**: The privacy area MUST list incidents flagged as personal data breaches (spec 024) without duplicating them, and let an Editor link each to one or more processing activities.
- **FR-007**: All privacy records MUST be workspace-scoped, readable by Viewers and above, and writable by Editors and above (except DPIA approval, per FR-004).

### Key Entities

- **Processing activity**: one purpose for which the client processes personal data, with the Article-30-style fields above.
- **DPIA**: an impact assessment for one processing activity, with risks, mitigations, residual risk, status, and approval.
- **Breach–activity link**: an association between a personal-data-breach incident (spec 024) and a processing activity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can produce a complete record of the client's processing activities from one place.
- **SC-002**: Every special-category activity lacking an approved DPIA is visibly flagged.
- **SC-003**: Every personal data breach can be traced to the processing activities it affected, without a second breach register.

## Assumptions

- Field sets follow GDPR Article 30 and Article 35, the most common reference point. Jurisdiction-specific variants aren't modelled separately.
- No data-subject request (access or erasure) tracking in this version. That's a reasonable follow-on.
- No automated data discovery or mapping. Everything is entered by a consultant.
- Breaches live in the incident log (spec 024). This feature only surfaces and links them.
