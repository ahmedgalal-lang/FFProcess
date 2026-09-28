# Feature Specification: Conflicts of Interest & Training Records

**Feature Branch**: `021-conflicts-and-training`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Backlog #8 — conflict-of-interest register, code-of-conduct attestations, and training/certification tracking with expiry, for each client workspace's people."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recording and resolving a conflict of interest (Priority: P1) 🎯 MVP

A consultant learns that someone at the client, say a procurement manager whose spouse owns a supplier, has a potential conflict of interest. Today there is nowhere to record it. They need a register of declared conflicts: who declared it, what the interest is, when it was declared, what's being done about it, and whether it's resolved.

**Why this priority**: A conflict-of-interest register is a core expectation of any governance review, and it has no home in the product today. It is also self-contained: it only needs the workspace's existing People directory.

**Independent Test**: Record a conflict against a person in the directory, move it from Declared to Under review to Mitigated with a mitigation note, then close it. Confirm the register shows its current state and the person it concerns throughout.

**Acceptance Scenarios**:

1. **Given** a person in the workspace's People directory, **When** an Editor records a conflict for them (a description of the interest, the related party or organization, and the date declared), **Then** it appears in the conflicts register as Declared.
2. **Given** a declared conflict, **When** an Editor moves it to Under review, then Mitigated (with a note on how it's being managed, such as recusal from a vendor decision), then Closed, **Then** each state and its note are kept and visible.
3. **Given** the register, **When** viewing it, **Then** open conflicts (Declared, Under review, Mitigated) are clearly distinguishable from Closed ones.
4. **Given** a conflict recorded by mistake, **When** an Editor deletes it, **Then** it is removed.

---

### User Story 2 - Tracking training and certifications, with expiry (Priority: P2)

The client's staff complete required training such as anti-bribery, data protection, or a code-of-conduct refresher, and some of it expires. A consultant needs to record who completed what and when, and see at a glance whose training has expired or is about to.

**Why this priority**: Valuable and independent of User Story 1, but a smaller gap: training is often tracked in the client's own HR systems. This gives the consultant a governance-level view rather than replacing that.

**Independent Test**: Define a training course with a validity period, record completions for two people (one recent, one long ago), and confirm the long-ago one shows as expired while the recent one shows as current.

**Acceptance Scenarios**:

1. **Given** a workspace, **When** an Editor defines a training course (its name, and optionally how many months a completion stays valid), **Then** it's available to record completions against.
2. **Given** a course and a person, **When** an Editor records that the person completed it on a date, **Then** the record shows that date and, if the course has a validity period, the date it expires.
3. **Given** a completion whose expiry date has passed, **When** viewing training records, **Then** it's visibly marked Expired; one expiring within the next 30 days is visibly marked Expiring soon.
4. **Given** a course with no validity period, **When** a completion is recorded, **Then** it never expires.
5. **Given** a completion recorded by mistake, **When** an Editor deletes it, **Then** it's removed.

---

### Edge Cases

- What happens to a person's conflicts and training records if that person is removed from the People directory? They're removed along with the person, matching how every other person-linked record in this app already behaves.
- What happens when a course is deleted that already has completions recorded against it? The completions are deleted with it, and the delete confirmation says how many will go.
- What about code-of-conduct attestation? It is already covered: publishing a Code of Conduct policy and recording who has acknowledged it (Policy Lifecycle, spec 018) is that attestation. This feature does not build a second mechanism for it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let an Editor record a conflict of interest against a person in the workspace's People directory, with a description, the related party or organization, and the date declared.
- **FR-002**: Every conflict MUST carry a status (Declared, Under review, Mitigated, Closed), changeable by an Editor, and an optional mitigation note.
- **FR-003**: The conflicts register MUST distinguish open conflicts (anything not Closed) from closed ones.
- **FR-004**: System MUST let an Editor edit or delete a conflict.
- **FR-005**: System MUST let an Editor define training courses per workspace, each with a name and an optional validity period in months.
- **FR-006**: System MUST let an Editor record a person's completion of a course on a given date, and delete a completion recorded in error.
- **FR-007**: For a course with a validity period, each completion MUST show its expiry date, and MUST be flagged Expired once that date has passed and Expiring soon within 30 days before it.
- **FR-008**: Conflicts and training records MUST be workspace-scoped: visible only within the workspace they belong to, and readable by Viewers and above.
- **FR-009**: Removing a person from the People directory MUST remove their conflicts and training completions with them.

### Key Entities

- **Conflict of interest**: a declared interest held by one person, with a description, related party, date declared, status, and optional mitigation note.
- **Training course**: a named piece of required training in a workspace, with an optional validity period.
- **Training completion**: one person's completion of one course on a date. Its expiry is derived from the course's validity period rather than stored separately.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can see every open conflict of interest in a workspace, and who it concerns, in one place.
- **SC-002**: A consultant can see every expired or soon-to-expire training completion in a workspace without opening each person's record.
- **SC-003**: Zero duplication with existing policy acknowledgement: code-of-conduct attestation continues to live in the Policy Library.

## Assumptions

- People in the directory have no logins of their own, so conflicts and completions are recorded by a consultant on their behalf. Self-declaration by client staff is out of scope.
- "Expiring soon" is a fixed 30-day window. Making it configurable is out of scope.
- No reminders or notifications for expiring training. Flags appear only when someone looks.
- These registers live on the existing Governance page as new sections, not new top-level pages.
- Editor access for writes and Viewer access for reads, the same bar as every other governance record except the ethics case register (spec 022), which is Admin-only.
