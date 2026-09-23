# Feature Specification: Decision Branch Editor

**Feature Branch**: `014-decision-branch-editor`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Gate the Yes/No branch inputs to Decision-type steps only, and give them a real two-branch editor instead of a free-text label. Today, in the Steps List's quick-add step form, every step type — Task, Decision, Start, End alike — shows one free-text 'Connector label' field with a 'Yes / No' placeholder hint. It's just a label on a single outgoing connection; nothing distinguishes a Decision step's branching from an ordinary step's connector, and nothing stops a Decision from having zero, one, or five outgoing connections with arbitrary labels. When a step's Type is set to Decision, a popup should appear with two boxes — 'If Yes, then...' and 'If No, then...' — and each box lets the consultant pick what happens on that branch: continue to a brand-new step or link to a step that already exists in the process."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Decision steps get a real branch editor, other steps don't (Priority: P1)

A consultant building out a process reaches a step that is genuinely a decision — "Approved?", "Over threshold?", "Client responds?" — and sets its Type to Decision. Two boxes appear on that same step's form: one for what happens if the answer is Yes, one for what happens if it's No — separate from, and in addition to, the plain field that already lets the consultant say what precedes this step. For every other step type, the two boxes never appear — Task, Start and End keep exactly the form they have today.

**Why this priority**: This is the reported gap itself. Without it, a Decision step is visually and functionally indistinguishable from any other step's single connector, which is what prompted the request — "the yes and no in the decision is not implemented."

**Independent Test**: Create a step, set its Type to Decision, confirm the two-box editor appears alongside the step's other fields. Set another step's Type to Task (or Start, or End), confirm no such editor appears anywhere on its form.

**Acceptance Scenarios**:

1. **Given** the step form with Type set to Task, **When** the consultant changes Type to Decision, **Then** a two-box branch editor labeled for the Yes and No outcomes appears in addition to the step's existing fields — including the single "connects from" field, which is left exactly as it is and keeps describing what precedes this step, a separate question from what the step itself branches to.
2. **Given** the step form with Type set to Decision and the branch editor visible, **When** the consultant changes Type back to Task, **Then** the branch editor disappears; every other field, including "connects from," is unaffected by the change.
3. **Given** a step whose Type is Task, Start, or End, **When** the consultant opens or edits that step, **Then** no Yes/No branch editor is ever shown for it — only the plain "connects from" field it already has.

---

### User Story 2 - Each branch can lead to a new step or an existing one (Priority: P1)

Inside the branch editor, the consultant fills in what happens on each outcome. For "If Yes," they might create a brand-new next step right there, named on the spot. For "If No," they might instead point at a step that already exists elsewhere in the process — including an earlier one, to model a decision that loops back ("No → back to Adjust and Refine") rather than always moving forward.

**Why this priority**: This is the other half of the original ask — a branch is only useful if it can target either kind of destination. A branch editor that could only create new steps would not cover the loop-back case that shows up constantly in real client processes (rework loops, resubmission, escalation back a step).

**Independent Test**: From a Decision step's branch editor, set "If Yes" to create a new step and name it; confirm the new step and connection appear. Set "If No" on the same decision to point at a step that was already in the process before this decision was created; confirm a connection to that existing step appears, with no new step created.

**Acceptance Scenarios**:

1. **Given** the branch editor open on a Decision step, **When** the consultant chooses "create a new step" for the Yes branch and names it, **Then** a new step is added to the process and a labeled connection runs from the decision to it.
2. **Given** the branch editor open on a Decision step and at least one other step already exists in the process, **When** the consultant chooses that existing step for the No branch, **Then** a labeled connection runs from the decision to that existing step and no new step is created.
3. **Given** a Decision step positioned after several other steps, **When** the consultant links a branch to a step that comes earlier in the Steps List, **Then** the connection is created exactly as any other branch would be — looping back is not blocked or treated as an error.

---

### User Story 3 - A decision can outgrow two outcomes (Priority: P2)

Not every decision is a strict yes/no. A consultant modeling "Which region?" or "Route to which team?" needs more than two branches off one Decision step. The two-box editor is where every Decision starts, but it is not a hard ceiling.

**Why this priority**: Named directly in the request as something the spec needs to answer, but it is the less common case — most decisions in the fixtures and reported examples are genuinely binary. The two-branch flow (User Stories 1 and 2) delivers the reported value on its own; this extends it.

**Independent Test**: Open the branch editor on a Decision step, add a third branch beyond Yes/No, give it its own label and destination, and confirm all three connections are created and independently editable.

**Acceptance Scenarios**:

1. **Given** the branch editor open on a Decision step showing the two default boxes, **When** the consultant adds another branch, **Then** a third box appears with its own editable label (not required to be "Yes" or "No") and its own destination picker.
2. **Given** a Decision step with three or more branches already saved, **When** the consultant reopens the branch editor, **Then** every existing branch is shown, each independently editable and removable.

---

### Edge Cases

- What happens when a Decision step's branch editor is left with one or both boxes empty and the step is saved anyway? The step and its Type are saved regardless; an unfilled box simply means that branch does not exist yet and can be added later — a Decision is not required to have any particular number of connections to be saved, matching how every other step type already works.
- What happens to a Decision step that already has connections carrying labels other than "Yes"/"No" (from before this feature, or added another way)? They must appear in the branch editor exactly as they are, editable in place — this feature does not rename, remove, or otherwise touch existing data, and existing arbitrary labels are not treated as invalid.
- What happens when a consultant changes an existing step's Type away from Decision after it already has two or more outgoing connections? The connections are left exactly as they are; only the branch editor disappears. Nothing about the step's own outgoing connections is deleted, and the plain "connects from" field (which never described them in the first place) is unaffected.
- What happens when a consultant sets both the Yes and No branches to the same destination step? This is allowed — a decision that funnels to the same next step regardless of outcome is a legitimate shape (the outcome may still matter elsewhere, e.g. for reporting), and the two connections are simply created with their own labels to the same target.
- What happens when a consultant picks the Decision step itself as a branch's destination? This is allowed rather than rejected — a decision that can send its own outcome back to itself (e.g. "No → ask again") is an unusual but legitimate shape, the same reasoning as looping back to an earlier step in general (User Story 2, Acceptance Scenario 3).
- What happens when a branch's destination step is later deleted? The connection is removed along with it, the same as any other connection to a deleted step today — no special handling is introduced for a branch connection.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The step form MUST show the Yes/No branch editor only when the step's Type is Decision, in addition to the plain "connects from" field every type already shows (which describes what precedes the step — a separate question from what the step, if it is a Decision, branches to). No other Type (Task, Start, End) ever shows the branch editor.
- **FR-002**: Changing a step's Type to Decision MUST reveal the branch editor immediately, without a separate confirmation step; changing it away from Decision MUST hide the branch editor. The plain "connects from" field is never hidden or replaced by this feature, for any Type.
- **FR-003**: The branch editor MUST present exactly two boxes by default, one for each of the step's two most common outcomes, each independently letting the consultant choose its destination.
- **FR-004**: Each box's default label MUST be "Yes" and "No" respectively, and the consultant MUST be able to rename either label to something else (e.g., "Approved" / "Rejected") without changing what the box does.
- **FR-005**: For each box, the consultant MUST be able to choose one of two kinds of destination: create a brand-new step (naming it inline) or select a step that already exists in the process.
- **FR-006**: The existing-step picker MUST offer every other step already in the process, including ones that appear earlier in the Steps List than the Decision step itself, so a branch can loop back.
- **FR-007**: Confirming a branch (new-step or existing-step) MUST create one connection from the Decision step to the chosen destination, carrying that branch's label.
- **FR-008**: A Decision step MUST be saveable with either or both branch boxes left unset; leaving a box unset MUST NOT create a connection for it and MUST NOT block saving the step.
- **FR-009**: Reopening the branch editor on a Decision step that already has outgoing connections MUST show each existing connection as an already-filled branch box, using that connection's own stored label — regardless of whether the label is "Yes," "No," or anything else.
- **FR-010**: The consultant MUST be able to add branches beyond the initial two, each with its own editable label and destination picker.
- **FR-011**: The consultant MUST be able to remove an existing branch from the editor, which deletes the underlying connection.
- **FR-012**: Editing a branch's label MUST update the stored connection's label without changing its destination; editing a branch's destination MUST update which step the connection points to without requiring the label to be re-entered.
- **FR-013**: None of this feature's behavior MUST alter how a Decision step's branches are drawn on the interactive Process Map canvas or on the printed/exported map — both already render a connection's own label, and continue to be fed by the same connection data, only now created and edited through a clearer flow.
- **FR-014**: This feature MUST NOT change or migrate any existing connection data — every process with Decision steps and connections that predate this feature MUST continue to work and display correctly the first time its branch editor is opened.
- **FR-015**: Creating, editing, or removing a branch MUST require the same workspace access level that creating or editing any other step or connection already requires; a viewer-level user MUST NOT be offered the branch editor's write actions, matching the access rule every other process-editing control in the product already follows.

### Key Entities

- **Process Step**: An existing entity; its Type field (Task/Decision/Start/End) is what gates whether the branch editor is shown alongside the step's other fields. No new fields are needed on it.
- **Step Connection**: An existing entity (from-step, to-step, optional label). A Decision step's branches are simply its own outgoing connections; each branch box in the editor corresponds to one connection, and "adding a branch" means creating one, "removing a branch" means deleting one, and renaming a branch means updating its label. No new fields or entities are needed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a Decision step, a consultant can define both a Yes and a No outcome — one to a new step, one to an existing step — in under 30 seconds, without leaving the Steps List.
- **SC-002**: Zero non-Decision steps (Task, Start, End) ever show the Yes/No branch editor, across every process in the product.
- **SC-003**: Every Decision step in every process that existed before this feature shipped continues to display its existing branch connections correctly the first time its branch editor is opened — zero connections lost, relabeled, or misattributed.
- **SC-004**: A consultant modeling a decision with more than two outcomes can add a third (or further) branch without being blocked or needing a workaround (e.g., adding an unrelated intermediate step) to represent it.
- **SC-005**: A reader of the printed/exported process map sees no change in how a decision's branches are drawn — the same rail/elbow labeling spec 013 already produces — after this feature ships.

## Assumptions

- **The branch editor lives in the Steps List's add-step and per-step edit flows**, which is where the reported gap is. The full node-based Process Map canvas keeps its existing drag-to-connect interaction for drawing connections directly; this feature does not change how connections are drawn there, only how they are drawn from the Steps List, and both surfaces read and write the same Step Connection data either way.
- **The two boxes are the starting point, not a hard limit.** A Decision begins with a Yes/No pair and can grow more branches (User Story 3); nothing in this feature caps a Decision at two outgoing connections, matching how the data model already allows any number.
- **No new data model is required.** Step Connection already carries an optional label and already allows multiple connections from one step; this feature is additive UI/UX over existing structure, not a schema or migration change.
- **Out of scope**: join/convergence steps (two steps both required before a third can start) and parallel-branch numbering (e.g., "7a"/"7b" in the Steps List) are a separate, later feature. They were discussed alongside this one because a join is, conceptually, the same editor used from the receiving end of a branch — but building that shared mechanism is deliberately not part of this spec, to keep this change scoped to what was actually reported missing.
- **Out of scope**: bulk-editing or reconciling existing arbitrary-labeled connections across many processes at once. This feature only guarantees they display correctly when a consultant opens that one Decision step's editor; it does not run a workspace-wide cleanup.
