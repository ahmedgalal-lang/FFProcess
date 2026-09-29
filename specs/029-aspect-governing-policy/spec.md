# Feature Specification: A Governing Policy for Every Aspect

**Feature Branch**: `029-aspect-governing-policy`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "We just need to have the policies that control these aspects (all aspects for governance)." Confirmed as "Policy per aspect": every governance aspect has its governing policy in the Policy Library, drafted by the assessment or from a standard template, shown on that aspect's tab, with the existing policy lifecycle applying unchanged. This replaces the operational registers (conflicts, training, ethics cases, vendors, incidents, privacy), which were removed at the user's request.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seeing and setting an aspect's governing policy (Priority: P1) 🎯 MVP

Each governance aspect (Board Structure, Risk & Internal Controls, Ethics, and so on) is governed by one document: a Board Charter, a Risk Management Policy, a Code of Ethics. Today the Policy Library holds policies, but nothing says which one governs which aspect, and a hand-written policy has no aspect at all. A consultant opening an aspect's tab needs to see its governing policy and where it stands in its lifecycle, and to set one when it has none.

**Why this priority**: It is the core of the request: the Governance area is organised around the policies that control each aspect.

**Independent Test**: On an aspect with no governing policy, designate an existing policy from the library as its governing policy. Confirm the aspect's tab shows that policy's title and lifecycle status, and opening it shows the full policy.

**Acceptance Scenarios**:

1. **Given** an aspect with no governing policy, **When** a consultant opens its tab, **Then** it says the aspect has no governing policy yet and offers the ways to create or choose one.
2. **Given** a policy in the workspace's Policy Library, **When** an Editor sets it as an aspect's governing policy, **Then** the aspect's tab shows that policy's title and lifecycle status (Draft, In Review, Approved, Published or Retired), and opening it shows the policy with its versions and acknowledgements.
3. **Given** an aspect with a governing policy, **When** an Editor sets a different policy as its governing policy, **Then** the new one replaces it; the previous policy stays in the library, no longer marked as governing that aspect.
4. **Given** an aspect with a governing policy, **When** an Editor removes the designation, **Then** the aspect has no governing policy and the policy stays in the library.
5. **Given** the Policy Library, **When** viewing it, **Then** each governing policy is labelled with the aspect it governs.

---

### User Story 2 - Creating a governing policy from a template or with the AI (Priority: P2)

Most aspects start without any policy. A consultant needs a fast, credible starting point: a standard template for the kind of policy that aspect needs, or a draft tailored to the client by the AI, which they then edit and take through review and approval.

**Why this priority**: Designation (US1) only helps once a policy exists; this is how most governing policies will come into being.

**Independent Test**: On the Board Structure aspect, start its governing policy from the Board Charter template. Confirm a Draft policy is created with the template's content, set as the aspect's governing policy, and editable like any other policy. On a custom aspect, draft one with the AI and confirm the same.

**Acceptance Scenarios**:

1. **Given** an aspect with no governing policy, **When** an Editor starts one from a template, **Then** they can choose from the built-in catalogue of standard governance policies, with the one matching the aspect suggested first, and a Draft policy is created from it and set as the aspect's governing policy.
2. **Given** an aspect with no governing policy and a completed governance profile, **When** an Editor asks the AI to draft one, **Then** a Draft governing policy tailored to the client's size, industry and jurisdiction and to the aspect is created and set as the aspect's governing policy.
3. **Given** an aspect with no governing policy, **When** an Editor writes one by hand, **Then** it is created as a Draft and set as the aspect's governing policy.
4. **Given** an aspect with no governing policy, **When** its assessment is generated or regenerated, **Then** the assessment also drafts its governing policy. An aspect that already has one keeps it untouched.
5. **Given** a governing policy created any of these ways, **When** it is edited, submitted, approved, published, retired, given a review-due date or acknowledged, **Then** the Policy Lifecycle (spec 018) applies exactly as for any other policy.

---

### User Story 3 - Seeing which aspects lack a published governing policy (Priority: P3)

A client's governance is only as complete as its weakest aspect. The consultant needs to see at a glance which aspects have no governing policy, or one that isn't yet Published, and the exported report needs to show the governing policy behind each aspect.

**Why this priority**: It builds on US1 and US2 and turns them into a measure of completeness.

**Independent Test**: With three aspects (one with a Published governing policy, one with a Draft, one with none), confirm the summary panel counts two aspects without a published governing policy, and the exported report lists each aspect with its governing policy and status.

**Acceptance Scenarios**:

1. **Given** a workspace, **When** viewing the Governance summary panel, **Then** it shows how many aspects have no Published governing policy, linking to the aspects.
2. **Given** the aspect tabs, **When** an aspect has no governing policy, or one that isn't Published, **Then** its tab shows that at a glance.
3. **Given** a workspace with governing policies, **When** its report is exported, **Then** the Governance & Risk section lists each aspect with its governing policy's title, lifecycle status and effective date, or "No governing policy" when it has none.

---

### Edge Cases

- What happens when an aspect is deleted? Its governing policy stays in the library, no longer governing anything, like any policy that loses its aspect today.
- What happens when an aspect is renamed? Its governing policy keeps governing it; only the label shown changes.
- Can one policy govern two aspects? No. Setting a policy as governing a second aspect is refused with a message naming the aspect it already governs; the consultant removes that designation first.
- What happens when a governing policy is deleted from the library? The aspect goes back to having no governing policy.
- What happens when the governing policy is Retired? It still governs the aspect but counts as not Published, so the aspect is flagged until a replacement is published and designated.
- What does a custom aspect with no matching template get? The whole catalogue, with no suggestion first, plus the AI draft and hand-written options.
- Does regenerating an assessment change an existing governing policy? No. It only drafts one when the aspect has none.
- What about policies drafted from checklist items? They stay as they are: supporting policies linked to their checklist item, shown under the aspect as today. Only one policy per aspect is its governing policy.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each aspect MUST have at most one governing policy, and each policy MUST govern at most one aspect.
- **FR-002**: An aspect's tab MUST show its governing policy's title and lifecycle status, open the policy on request, or say that it has none.
- **FR-003**: An Editor MUST be able to set any policy in the same workspace as an aspect's governing policy, replace it, or remove the designation. None of these deletes a policy.
- **FR-004**: An Editor MUST be able to create an aspect's governing policy from the built-in template catalogue, from an AI draft, or by writing it, each creating a Draft already set as that aspect's governing policy.
- **FR-005**: The template catalogue MUST include a standard policy for each of the seven default aspects and for common governance topics, and MUST suggest the template matching the aspect first when there is one.
- **FR-006**: Generating or regenerating an aspect's assessment MUST draft its governing policy when it has none, and MUST NOT change an existing one.
- **FR-007**: Governing policies MUST follow the Policy Lifecycle (spec 018) unchanged: versions, review, Admin approval and publishing, review-due dates, acknowledgements and retirement.
- **FR-008**: The Policy Library MUST label each governing policy with the aspect it governs.
- **FR-009**: Deleting an aspect MUST keep its governing policy in the library, and deleting a governing policy MUST leave its aspect with none.
- **FR-010**: The Governance summary panel MUST count aspects without a Published governing policy and link to them.
- **FR-011**: The exported report's Governance & Risk section MUST list each aspect with its governing policy's title, lifecycle status and effective date, or state that it has none.
- **FR-012**: Designating, replacing and removing a governing policy MUST be recorded in the governance activity log (spec 019).
- **FR-013**: All of this MUST be workspace-scoped, readable by Viewers and above, and changeable by Editors and above; approval and publishing remain Admin-only, as in spec 018.
- **FR-014**: The aspect list MUST NOT change: no standard aspects are added for the governance areas whose registers were removed. Their topics are covered by the template catalogue, available to any aspect, including one a consultant adds.

### Key Entities

- **Aspect**: an area of governance in a workspace (spec 017), now with at most one governing policy.
- **Governing policy**: an ordinary policy in the Policy Library that is designated as the governing policy of one aspect.
- **Policy template**: a standard, built-in starting point for a governance policy (title, purpose and structure), with the aspect topic it suits. Using one copies its content into a new Draft; the template itself never changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can give an aspect a Draft governing policy, from a template or the AI, in under one minute.
- **SC-002**: For any workspace, anyone reading the Governance page can tell within 5 seconds which aspects lack a Published governing policy.
- **SC-003**: Every aspect in the exported report shows its governing policy or states that it has none.
- **SC-004**: No policy is ever deleted or overwritten as a side effect of designating, replacing, regenerating or deleting an aspect.

## Clarifications

### Session 2026-09-29

- Q: Should every workspace also get standard aspects for the areas whose registers were removed (Conflicts of Interest, Whistleblowing, Anti-bribery, Third-party Management, Incident Management, Data Protection, Training & Awareness)? → A: No. The aspect list stays as the seven defaults plus whatever the consultant adds; those topics remain available as templates.

## Assumptions

- Templates are generic, well-structured starting points written into the product (purpose, scope, roles and responsibilities, the policy statements, monitoring and review). They are labelled as templates to adapt and are not legal advice for any jurisdiction.
- The AI draft uses the same profile gate and AI availability rules as assessment generation: it needs company size, industry and jurisdiction, and says so plainly when AI isn't configured.
- Supporting policies drafted from checklist items continue to work exactly as today.
- A Retired governing policy counts as not Published for the completeness count, prompting a replacement.
- No per-aspect policy templates are editable by consultants in this version; a firm-level template library is out of scope.
