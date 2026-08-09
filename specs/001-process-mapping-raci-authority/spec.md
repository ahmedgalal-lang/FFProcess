# Feature Specification: Process Mapping, RACI & Authority Matrices

**Feature Branch**: `001-process-mapping-raci-authority`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Build FFProcess, a Next.js web application for consultants and enterprise operations/PMO teams to document business processes across three interconnected views, all scoped to a client-engagement Workspace: (1) Process Mapping — visual flowcharts of business processes with steps, decision points, sequencing, and swimlanes by role/department; (2) RACI Matrix — per-activity RACI code assignment per Role with validation that every task has exactly one Accountable and at least one Responsible; (3) Authority Matrix (Delegation of Authority) — which Roles/People can approve which decision types at what value thresholds, with escalation/co-approval chains. All three views share one org model per Workspace: People, Roles, and Activities/Steps entered once and reused across all three. Priority journeys: create workspace + org data + process map (P1), build & validate RACI matrix (P2), build & query authority matrix (P3), export to PDF/Excel/image (P4), invite teammates with workspace roles (P5)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Map a Process with the Org Behind It (Priority: P1)

A consultant starts a new client engagement. They create a Workspace for that client, add the client's Roles (e.g. "AP Clerk", "Finance Manager") and People (naming who currently holds each Role), then build a Process Map for a business process (e.g. "Purchase-to-Pay"): adding ordered steps, decision points, and assigning a responsible Role to each step, optionally grouping steps into swimlanes by Role/department.

**Why this priority**: Without a Workspace, an org model, and a way to lay out a process, none of the other two matrix types have anything to reference — this is the foundation the whole product stands on and the minimum slice that delivers standalone value (a shareable process map).

**Independent Test**: Can be fully tested by creating a Workspace, adding 3+ Roles and People, and building a 5+ step process map with at least one decision point and one swimlane — the map renders correctly, steps are ordered, and each step shows its assigned Role. Delivers value even if no RACI or Authority matrix is ever built for that workspace.

**Acceptance Scenarios**:

1. **Given** no existing workspace, **When** a user creates a new Workspace and names it, **Then** the user is taken to an empty workspace with prompts to add Roles/People and start a Process Map.
2. **Given** a Workspace with no Roles yet, **When** a user adds a Role and a Person and assigns the Person to the Role, **Then** both appear in the workspace's shared org directory and are selectable from any process, RACI, or authority matrix in that workspace.
3. **Given** an empty Process Map, **When** a user adds steps, connects them in sequence, adds a decision point with two branches, and assigns a Role to each step, **Then** the map persists the steps, connections, branch labels, and Role assignments, and re-opening the map shows the same layout.
4. **Given** a Process Map with steps assigned to Roles, **When** a user groups steps into swimlanes by Role, **Then** each step visually appears within its assigned Role's lane.
5. **Given** an in-progress edit to a Process Map, **When** the user makes a change and stops interacting, **Then** the change is saved automatically without an explicit "Save" action losing work on reload.
6. **Given** a new Process being created, **When** the user assigns it a Process Code (e.g. "SAL101") and optionally marks it as a sub-process of another Process in the same Workspace, **Then** the code and the parent/sub-process relationship are saved and the Process is discoverable by that code from anywhere in the Workspace.
7. **Given** three or more Processes that exist in the same Workspace, **When** a user adds links from a single Process Map step to two or more of those other Processes (e.g. one step that can hand off to either a Vendor Onboarding process or a Sales Order process depending on the situation), **Then** the step visibly shows every linked Process's code as a separate, individually followable link, and following any one of them opens that Process's map.

---

### User Story 2 - Build and Validate a RACI Matrix (Priority: P2)

Building on an existing process (its activities/steps) and the workspace's Roles, a user opens the RACI view for that process and assigns one RACI code (Responsible, Accountable, Consulted, or Informed) per Role for each activity. Before the matrix can be marked final, the system checks it against RACI rules and flags problems.

**Why this priority**: RACI is the tool's signature deliverable for most engagements and is the next layer of value after the process/org exists, but it depends on User Story 1's activities and Roles already existing.

**Independent Test**: Can be fully tested by taking a process with 4+ activities and 3+ Roles, assigning RACI codes across the grid (including deliberately leaving one activity without an Accountable), running validation, and confirming the system flags exactly that gap. Delivers value as a standalone reviewable/exportable matrix even before Authority Matrix or export exist.

**Acceptance Scenarios**:

1. **Given** a process with activities and a workspace with Roles, **When** a user opens the RACI matrix for that process, **Then** they see a grid with one row per activity and one column per Role, ready for assignment.
2. **Given** an empty grid cell, **When** a user assigns a RACI code to a Role for an activity, **Then** the cell shows the code and the assignment is saved.
3. **Given** an activity with no Role marked Accountable, **When** the user runs validation (or attempts to mark the matrix Final), **Then** the system blocks finalization and flags that specific activity as missing an Accountable.
4. **Given** an activity with no Role marked Responsible, **When** validation runs, **Then** the system flags that activity as missing a Responsible.
5. **Given** an activity where two Roles are both marked Accountable, **When** validation runs, **Then** the system flags the conflict and identifies both Roles.
6. **Given** a matrix with all validation issues resolved, **When** the user marks it Final, **Then** the matrix is locked from further RACI-rule violations and shows a "validated" status.

---

### User Story 3 - Define and Query an Authority Matrix (Priority: P3)

A user defines decision/transaction types requiring approval (e.g. "Purchase Order", "Contract Signature"), then specifies, per decision type, which Roles or People can approve it, up to what value threshold, and whether escalation or co-approval (a second approver) is required above certain thresholds. The user can then ask "who can approve a Purchase Order for $50,000?" and get a definitive answer, or a flag if no one is authorized or the rules conflict.

**Why this priority**: Authority Matrices are the third pillar of the product's value proposition and reuse the same People/Role model, but many engagements need only Process Mapping and RACI, so this can ship after those are solid.

**Independent Test**: Can be fully tested by defining one decision type with two threshold tiers (e.g. Role A up to $10,000, Role B up to $100,000 requiring co-approval above $50,000), then querying several values and confirming the system returns the correct authorized approver(s) or correctly flags a gap/conflict. Delivers value as a standalone approvals reference even without Process Map or RACI for the same activity.

**Acceptance Scenarios**:

1. **Given** a Workspace with Roles defined, **When** a user creates a new decision type and defines an approval rule (Role, maximum value threshold), **Then** the rule is saved and listed under that decision type.
2. **Given** a decision type with multiple threshold tiers across different Roles, **When** a user adds a rule requiring co-approval above a given value, **Then** queries above that value return both required approvers, not just one.
3. **Given** a decision type and a query value, **When** the user asks "who can approve this at value V", **Then** the system returns every Role/Person authorized at that value, correctly applying the highest applicable threshold.
4. **Given** a decision type with a value range not covered by any rule, **When** a user queries a value in that gap, **Then** the system flags "no authorized approver" for that value rather than silently returning nothing.
5. **Given** two rules whose thresholds overlap ambiguously for the same decision type and Role scope, **When** validation runs, **Then** the system flags the conflict and identifies the overlapping rules.

---

### User Story 4 - Export a Matrix or Map for External Sharing (Priority: P4)

A user exports a completed Process Map, RACI Matrix, or Authority Matrix as a document (PDF or image for the process map, PDF or spreadsheet for the matrices) to share with client stakeholders who do not have accounts in the tool.

**Why this priority**: Consultants' deliverables ultimately leave the tool as client-facing documents; this is high-value but strictly depends on the three artifact types already existing and being viewable.

**Independent Test**: Can be fully tested by exporting a populated RACI matrix and confirming the downloaded file opens outside the app and visually matches the on-screen matrix, including any unresolved-validation warnings if exported before finalization.

**Acceptance Scenarios**:

1. **Given** a completed Process Map, **When** a user chooses to export it, **Then** they receive a downloadable file (PDF or image) that visually reproduces the map's steps, connections, and swimlanes.
2. **Given** a completed RACI Matrix, **When** a user chooses to export it, **Then** they receive a downloadable file (PDF or spreadsheet) reproducing the grid of activities, Roles, and RACI codes.
3. **Given** a completed Authority Matrix, **When** a user chooses to export it, **Then** they receive a downloadable file reproducing decision types, thresholds, and approvers.
4. **Given** a matrix that still has unresolved validation issues, **When** a user exports it anyway, **Then** the exported file visibly indicates it is not yet validated/final.

---

### User Story 5 - Invite Teammates with Scoped Access (Priority: P5)

A workspace admin invites colleagues (or client staff) to a Workspace by email, assigning each an access level (Viewer, Editor, or Admin) within that workspace. Invited users can only see and act on workspaces they have been added to — except a Firm Owner (the consultancy's own leadership), who can see and act on every Workspace across every client without needing to be separately added to each one, and who manages the all-clients view and who else holds the Firm Owner role.

**Why this priority**: Solo use of the tool (a single consultant building artifacts) already delivers the core value in Stories 1-4; multi-user collaboration is important for team engagements but is not required for the first usable release. The Firm Owner capability rides on the same access-control mechanism this story builds, so it belongs here rather than as a separate story.

**Independent Test**: Can be fully tested by having a workspace admin invite a second account as Editor, confirming that account can edit but not manage workspace membership, and confirming a third, non-invited account cannot see the workspace at all — plus confirming a Firm Owner account can open that same workspace without ever being added as a Member.

**Acceptance Scenarios**:

1. **Given** a Workspace, **When** an admin invites a colleague by email with an access level, **Then** the invited person receives an invitation and, upon accepting, gains exactly that level of access to that workspace only.
2. **Given** a user with Viewer access, **When** they open any matrix or map in that workspace, **Then** they can view and export but cannot edit or invite others.
3. **Given** a user with Editor access, **When** they edit Roles, People, process maps, or matrices, **Then** their changes save, but they cannot manage workspace membership or delete the workspace.
4. **Given** a user with Admin access, **When** they manage members or workspace settings, **Then** they can add/remove members, change access levels, and delete the workspace.
5. **Given** a user who is not a member of a Workspace, **When** they attempt to access it directly (e.g. via a shared link), **Then** access is denied and no workspace data is revealed.
6. **Given** a Firm Owner, **When** they open the all-clients view, **Then** they see every Workspace in the Firm — including ones they hold no explicit Workspace membership in — and can open, view, and edit any of them.
7. **Given** a Firm Owner accessing a Workspace they are not an explicit Member of, **When** the access is recorded, **Then** it is attributable to their Firm Owner role, not indistinguishable from ordinary workspace membership.
8. **Given** a Firm with exactly one Firm Owner, **When** someone attempts to remove that person's Firm Owner role, **Then** the system blocks it so the Firm is never left without an Owner.

---

### Edge Cases

- What happens when a Role assigned throughout a Process Map, RACI Matrix, or Authority Matrix is deleted from the workspace's org directory? (Assumption: deletion is blocked while the Role is in use, or the Role is archived rather than hard-deleted, so historical assignments remain intact.)
- What happens when two browser tabs edit the same map/matrix under the single-editor model? (Assumption: the second tab's autosave is rejected or reconciled with a "this was changed elsewhere" notice rather than silently overwriting the first tab's work.)
- How does the system handle a process map with a cycle (a step that loops back to an earlier step)? Cycles must be representable (e.g. rework loops) without breaking validation or export.
- What happens when a RACI matrix activity has zero Roles assigned at all (not even Consulted/Informed)? This is distinct from "missing Accountable/Responsible" and should still surface as an incomplete-activity warning.
- What happens when an Authority Matrix query value exactly equals a threshold boundary (e.g. rule is "up to $10,000" and query is exactly $10,000)? Boundaries are inclusive of the stated threshold unless a rule explicitly states otherwise.
- What happens when a workspace's last remaining Admin tries to leave or is removed? The system must prevent a workspace from ending up with zero Admins.
- What happens when exporting a very large process map (100+ steps)? Export must still complete and remain legible (e.g. paginated PDF) rather than failing or producing an unreadable single page.
- What happens when a user tries to reuse a Process Code already assigned to another Process in the same Workspace? The system must reject the save and explain which Process already holds that code.
- What happens when a user tries to set a Process's parent to one of that Process's own descendants (or to itself)? The system must block the change rather than create a cycle.
- What happens when a Process that has sub-processes, or is the target of a step-level cross-process link, is deleted? Deletion is blocked (or the Process is archived rather than hard-deleted) until sub-processes are reassigned and inbound links are removed, consistent with how Roles/People are protected (FR-018).
- What happens when a Firm Owner opens a Workspace they hold no explicit Member record in and then edits its content? The edit is attributed to them and recorded like any other change; the system does not fabricate a Member record on their behalf (FR-024, Edge Cases below on auditability).
- What happens when the only Firm Owner tries to demote themselves or leaves? Blocked, same pattern as the last-Workspace-Admin rule (FR-026).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a user to create a Workspace representing a single client engagement or business unit, and all subsequent data (Roles, People, Process Maps, RACI Matrices, Authority Matrices) MUST be scoped to exactly one Workspace.
- **FR-002**: System MUST allow a user to define Roles and People within a Workspace, and to associate People with Roles, forming a shared org directory reusable across all three artifact types in that Workspace.
- **FR-003**: System MUST allow a user to create a Process Map consisting of ordered steps, connections between steps, decision points with labeled branches, and optional grouping of steps into swimlanes by Role.
- **FR-004**: System MUST allow a user to assign a responsible Role to each Process Map step.
- **FR-005**: System MUST allow a user to define one or more Activities for a process and build a RACI Matrix assigning exactly one RACI code (Responsible, Accountable, Consulted, or Informed) per Role per Activity cell.
- **FR-006**: System MUST validate a RACI Matrix and flag: any Activity with zero Roles marked Accountable, any Activity with more than one Role marked Accountable, and any Activity with zero Roles marked Responsible.
- **FR-007**: System MUST prevent a RACI Matrix from being marked "Final" while unresolved validation issues (per FR-006) remain.
- **FR-008**: System MUST allow a user to define Decision Types and, per Decision Type, one or more approval rules specifying an authorized Role or Person and a maximum value threshold.
- **FR-009**: System MUST allow an approval rule to require co-approval (a second authorized Role/Person) above a specified value threshold.
- **FR-010**: System MUST, given a Decision Type and a value, return every Role/Person authorized to approve at that value, correctly resolving which threshold tier applies.
- **FR-011**: System MUST flag a Decision Type value range that has no authorized approver, and MUST flag two approval rules whose thresholds create an ambiguous or conflicting authorization for the same scope.
- **FR-012**: System MUST allow a user to export a Process Map, RACI Matrix, or Authority Matrix to a downloadable file that a recipient without an account can open outside the application.
- **FR-013**: System MUST visibly indicate on export when the exported artifact has unresolved validation issues or is not marked Final.
- **FR-014**: System MUST allow a Workspace Admin to invite additional users to the Workspace by email and assign each an access level of Viewer, Editor, or Admin.
- **FR-015**: System MUST restrict a user's visibility and actions to only the Workspaces they are a member of, with the specific actions available determined by their access level (Viewer: view/export only; Editor: view/export/edit content; Admin: Editor privileges plus manage membership and workspace settings).
- **FR-016**: System MUST prevent a Workspace from having zero Admins at any time (e.g. block removing or downgrading the last remaining Admin).
- **FR-017**: System MUST autosave in-progress edits to Process Maps, RACI Matrices, and Authority Matrices without requiring an explicit save action, and MUST NOT silently discard a user's unsaved changes on navigation or reload.
- **FR-018**: System MUST prevent deletion of a Role or Person that is currently referenced by a Process Map step, RACI assignment, or Authority Matrix rule, without first removing or reassigning those references (or MUST archive rather than hard-delete referenced Roles/People, preserving historical assignments).
- **FR-019**: System MUST allow each Process to be assigned a short Process Code (e.g. "SAL101") that is unique within its Workspace, settable at creation and editable afterward, used to identify and reference the Process elsewhere in the system.
- **FR-020**: System MUST allow a Process to optionally be designated as a sub-process of exactly one other Process in the same Workspace, forming a main/sub-process hierarchy of arbitrary depth, and MUST prevent a Process from being set as an ancestor of itself (no circular hierarchies).
- **FR-021**: System MUST allow a Process Map step to optionally link to one or more other Processes (by Process Code) — a single step MAY represent a hand-off point into multiple downstream Processes — visibly marking each linked Process on that step, and MUST let a user follow any one of those links to open the linked Process's map.
- **FR-022**: System MUST reject an attempt to create or rename a Process with a Process Code already in use by another Process in the same Workspace.
- **FR-023**: System MUST recognize a single Firm (the consultancy operating the product) that owns every Workspace, and MUST associate every user with the Firm as either a Firm Owner or a regular Firm Member.
- **FR-024**: A Firm Owner MUST be able to access (view and edit) every Workspace under the Firm without holding an explicit per-workspace Member record, and MUST be able to view a consolidated list of every Workspace in the Firm.
- **FR-025**: A Firm Member who is not a Firm Owner MUST NOT gain access to any Workspace from Firm membership alone — Workspace access still requires an explicit Workspace Member record for that Firm Member, exactly as for any other user.
- **FR-026**: System MUST prevent the Firm from having zero Firm Owners at any time (e.g. block removing or downgrading the last remaining Firm Owner), mirroring FR-016's protection for Workspace Admins.
- **FR-027**: System MUST provide, for any Process Map, both the diagram view (the visual flowchart/swimlane canvas) and a linear list view (each step shown as an ordered entry with its type, assigned Role, predecessor, and any Process links), and MUST let a user switch between the two views of the same underlying steps at will — both views reflect the same data, so a step added in one is immediately visible in the other.

### Key Entities

- **Firm**: The single consultancy operating this product; owns every Workspace. Has a name and a list of Firm Members, each either a Firm Owner or a regular Firm Member.
- **Firm Member**: A user's membership in the Firm, carrying one Firm-level role (Owner or Member). Owner grants implicit access to every Workspace under the Firm; Member alone grants no Workspace access.
- **Workspace**: A single client engagement or business unit, belonging to the Firm; the isolation boundary for all other data (except the Firm Owner carve-out above). Has a name and a list of Members with access levels.
- **Member**: A user's membership in a Workspace, carrying one access level (Viewer, Editor, Admin).
- **Role**: A named organizational function within a Workspace (e.g. "Finance Manager"), reused across Process Maps, RACI Matrices, and Authority Matrices.
- **Person**: A named individual within a Workspace, optionally associated with one or more Roles.
- **Process**: A named business process within a Workspace, containing a Process Map and a set of Activities usable by a RACI Matrix. Carries a unique, workspace-scoped Process Code (e.g. "SAL101") and may designate one other Process in the same Workspace as its parent, forming a main/sub-process hierarchy.
- **Process Step**: A node in a Process Map — a task, decision point, start, or end — with sequencing/connections to other steps, an optional assigned Role, an optional swimlane grouping, and an optional link to another Process (by Process Code) representing a hand-off into that Process's map.
- **Activity**: A discrete unit of work within a Process that appears as a row in a RACI Matrix; may correspond to one or more Process Steps.
- **RACI Assignment**: The RACI code (Responsible, Accountable, Consulted, Informed) linking one Activity to one Role within a RACI Matrix.
- **Decision Type**: A named category of decision or transaction requiring approval (e.g. "Purchase Order") within a Workspace.
- **Approval Rule**: A rule linking a Decision Type to an authorized Role or Person, a maximum value threshold, and an optional co-approval requirement above a sub-threshold.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can create a Workspace, add org data (Roles/People), and produce a first Process Map with at least 5 steps in under 20 minutes without external help.
- **SC-002**: A user can build a RACI Matrix for a 10-activity process and receive validation feedback on missing/conflicting Accountable or Responsible assignments in under 5 seconds of requesting validation.
- **SC-003**: 95% of Authority Matrix approval queries return the correct authorized approver(s) (verified against manually-defined test scenarios) with no result appearing more than 2 seconds after the query.
- **SC-004**: A user can export any of the three artifact types to a file that a recipient without an account can open and read correctly on the first attempt, 100% of the time for artifacts under the documented size limits.
- **SC-005**: An invited teammate can accept an invitation and reach an editable view of the correct (and only the correct) Workspace within 2 minutes of receiving the invite.
- **SC-006**: In usability testing, 90% of first-time users successfully complete the "build and validate a RACI matrix" task without assistance.
- **SC-007**: No autosave data loss is observed across 100 consecutive simulated edit-and-reload cycles during testing.

## Assumptions

- Editing is single-editor-at-a-time with autosave; real-time multi-cursor collaborative editing (Google-Docs-style) is out of scope for v1 — a second editor's changes are reconciled or flagged rather than silently merged live.
- v1 supports export only; importing existing data from external files (Excel/CSV, Visio, BPMN) is out of scope for v1 and org/process data must be entered directly in the app.
- The Process Map canvas uses simple flowchart notation (boxes, arrows, decision diamonds, optional swimlanes by Role) rather than full BPMN 2.0 symbol compliance.
- Users have stable internet connectivity; there is no offline editing mode in v1.
- Authentication is standard email/password or SSO-style session login; no specific enterprise identity provider integration is required for v1 beyond standard practices.
- "Value thresholds" in the Authority Matrix are monetary amounts in a single currency per Workspace; multi-currency support is out of scope for v1.
- A Workspace corresponds 1:1 with a single client engagement or business unit; cross-workspace reporting/rollups are out of scope for v1.
- Deleted-but-referenced Roles/People are archived, not hard-deleted, so historical Process Map, RACI, and Authority Matrix data remains intact and auditable.
- Process Codes are free-text strings unique per Workspace (e.g. a department prefix plus a number, such as "SAL101"); the system suggests but does not rigidly enforce a specific pattern in v1.
- The main/sub-process hierarchy is a simple parent reference (a Process points at zero or one parent Process); there is no separate "program" or "portfolio" entity above it in v1 — a top-level Process with sub-processes serves that role.
- v1 supports exactly one Firm (this product instance belongs to one consultancy); it is not a multi-firm/white-label platform. Firm Owner is a small, explicitly-granted set of people (the firm's own leadership), not something every Workspace Admin inherits.

## Out of Scope (v1)

- Real-time collaborative (multi-cursor) editing.
- Importing external files (Excel/CSV, Visio, BPMN) into the tool.
- Native mobile applications.
- Full BPMN 2.0 notation compliance.
- Billing/payments and subscription management.
- Multi-currency authority thresholds.
- Cross-workspace reporting or analytics rollups.

## Amendments

- **2026-08-09**: Added Process Codes (FR-019, FR-022), main/sub-process hierarchy (FR-020), and
  step-level cross-process linking (FR-021) — requested to let processes like a Sales process
  ("SAL101") be uniquely identified, organized as main/subsidiary processes, and cross-referenced
  from steps in other processes.
- **2026-08-09**: Added the Firm and Firm Owner role (FR-023–FR-026) — requested so the
  consultancy's own leadership can access every client Workspace without being separately added
  to each one, while every other user remains strictly Workspace-scoped. Constitution Principle V
  amended (v1.0.0 → v1.1.0) to carve out this one explicit exception to "no implicit cross-workspace
  read or write."
- **2026-08-09**: Widened FR-021 so a single Process Map step can link to one or more other
  Processes, not just one — requested so a step (e.g. "Send PO to Vendor") can represent multiple
  possible hand-offs (e.g. either Vendor Onboarding or Sales Order Fulfillment, depending on the
  situation) rather than being limited to a single downstream Process.
- **2026-08-09**: Added FR-027 — a linear list view of a Process Map's steps as an alternative to
  the diagram view, switchable at will, both reflecting the same underlying steps. Requested so
  users who prefer scanning steps as a sequence (rather than a spatial diagram) have that option
  without maintaining separate data.
