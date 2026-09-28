# Feature Specification: Vendor & Third-Party Risk Register

**Feature Branch**: `023-vendor-risk-register`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Backlog #10 — vendor / third-party risk register (due diligence, contracts, renewals)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registering the client's key vendors with a criticality rating (Priority: P1) 🎯 MVP

A consultant reviewing a client's governance needs to know which outside parties the client depends on: IT providers, outsourced payroll, a sole-source component supplier. They need one register listing each vendor, what service it provides, who at the client owns the relationship, and how critical it is to the business.

**Why this priority**: Nothing else in this feature (due diligence, renewals, linked risks) makes sense until the vendors themselves are listed.

**Independent Test**: Add three vendors at different criticality levels, each with a service description and an internal owner, and confirm the register lists them with the most critical first.

**Acceptance Scenarios**:

1. **Given** a workspace, **When** an Editor adds a vendor (its name, the service it provides, a criticality of Low, Medium, High, or Critical, and optionally an internal owner, being a role or a person from the directory), **Then** it appears in the vendor register.
2. **Given** the register, **When** viewing it, **Then** vendors are ordered by criticality, most critical first.
3. **Given** a vendor, **When** an Editor edits or deletes it, **Then** the change is kept or it's removed.

---

### User Story 2 - Due diligence and contract renewal tracking (Priority: P2)

For each vendor the consultant needs to know whether due diligence has been done and when it's next due, and when the contract ends, so a critical vendor's contract doesn't lapse or auto-renew unreviewed.

**Why this priority**: This is what turns a list of vendors into something that prompts action, but it only has value once User Story 1's register exists.

**Independent Test**: Give one vendor a due-diligence review dated over a year ago with an annual cycle, and a contract ending in 20 days. Confirm the register flags both "Due diligence overdue" and "Renewal within 60 days".

**Acceptance Scenarios**:

1. **Given** a vendor, **When** an Editor records its due-diligence status (Not started, In progress, Completed, with the date last completed) and a review cycle in months, **Then** the vendor shows when its next review is due.
2. **Given** a vendor whose next review date has passed, **When** viewing the register, **Then** it's flagged Due diligence overdue.
3. **Given** a vendor with a contract end date within the next 60 days, **When** viewing the register, **Then** it's flagged Renewal within 60 days; once the end date has passed, it's flagged Contract expired.

---

### User Story 3 - Linking a vendor to risks on the Risk Register (Priority: P3)

A vendor can be the source of risks the client already tracks, such as the risk of a single supplier failing. The consultant should be able to link a vendor to one or more existing risks on the workspace's Risk Register, so each is visible from the other.

**Why this priority**: It connects this register to the one the client already maintains. Useful, but the register stands on its own without it.

**Independent Test**: Link a vendor to an existing risk. Confirm the vendor lists the risk, and the risk shows which vendor it relates to.

**Acceptance Scenarios**:

1. **Given** a vendor and an existing risk on the same workspace's Risk Register, **When** an Editor links them, **Then** the vendor lists that risk and the risk names the vendor.
2. **Given** a linked vendor and risk, **When** either one is deleted, **Then** only the link is removed; the other survives untouched.

---

### Edge Cases

- What happens to a vendor whose internal owner (a role or person) is removed from the workspace? The vendor stays and its owner reads as unassigned, matching how a risk's owner already behaves.
- What happens with a vendor that has no contract end date or review cycle? It simply isn't flagged for renewal or review. Both are optional.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let an Editor add, edit, and delete vendors, each with a name, service description, criticality (Low, Medium, High, Critical), and optional internal owner (a role or a person).
- **FR-002**: The register MUST list vendors in criticality order, most critical first.
- **FR-003**: Each vendor MUST support a due-diligence status (Not started, In progress, Completed), a last-completed date, and an optional review cycle in months, from which the next review date is derived.
- **FR-004**: The register MUST flag a vendor Due diligence overdue once its next review date has passed.
- **FR-005**: Each vendor MUST support optional contract start and end dates. The register MUST flag Renewal within 60 days and Contract expired based on the end date.
- **FR-006**: System MUST let an Editor link a vendor to any number of existing risks on the same workspace's Risk Register, and unlink them. Deleting either side MUST remove only the link.
- **FR-007**: Vendors MUST be workspace-scoped, readable by Viewers and above, and writable by Editors and above.

### Key Entities

- **Vendor**: an outside party the client depends on, with its name, service, criticality, optional owner, due-diligence status and dates, review cycle, and contract dates.
- **Vendor–risk link**: an association between one vendor and one risk on the same workspace's Risk Register.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can see every vendor in a workspace, most critical first, in one place.
- **SC-002**: Every vendor with overdue due diligence or a contract ending within 60 days is visibly flagged, with no need to open each one.
- **SC-003**: A risk that stems from a vendor can be traced to that vendor, and the reverse.

## Assumptions

- The 60-day renewal window is fixed in this version.
- No contract documents, spend figures, or procurement workflow. This is a governance register, not a procurement system.
- No notifications for upcoming renewals or overdue reviews.
