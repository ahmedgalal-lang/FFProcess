# Feature Specification: Policy Lifecycle

**Feature Branch**: `018-policy-lifecycle`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Give governance policies a real lifecycle instead of a single free-text draft: version history, an approval workflow, review-due dates, and lightweight acknowledgement tracking. Reported gap (from a completeness audit against standard GRC/governance platform functionality): 'no versioning, no draft→review→approve workflow with a named approver/date, no effective/review dates, no distribution + read-receipt/attestation tracking. Today a policy is just a text blob with a status enum.'"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Taking a policy from draft to an approved, published document (Priority: P1) 🎯 MVP

A consultant has written or AI-drafted a policy in the Policy Library. Today it's just a text blob that anyone with edit access can silently change forever. They need to submit it for a colleague with authority to review, have that person approve it, and then publish it as the policy of record — with every edit along the way kept as a retrievable version, and an approved document that can never be silently rewritten out from under them (by hand or by the AI regenerating its source assessment).

**Why this priority**: This is the core of "a policy lifecycle" — without a real state machine and version history, nothing else in this feature (review dates, acknowledgement) has anything meaningful to attach to. It's also the most standards-recognizable GRC gap this closes.

**Independent Test**: Write a policy, submit it for review, approve it as an ADMIN, publish it, and confirm its full version history is visible. Edit the published policy's body and confirm it drops back to Draft and must be re-approved. Confirm re-running the assessment that originally suggested this policy never overwrites it once it has left Draft.

**Acceptance Scenarios**:

1. **Given** a newly written or AI-drafted policy (Draft), **When** an Editor submits it for review, **Then** its lifecycle status becomes "In Review" and it is unchanged otherwise.
2. **Given** a policy "In Review", **When** an Admin approves it, **Then** its lifecycle status becomes "Approved," and the approving person and the approval date are recorded and visible.
3. **Given** an "Approved" policy, **When** an Admin publishes it, **Then** its lifecycle status becomes "Published" and it carries an effective date (defaulting to today, changeable by an Admin).
4. **Given** a "Published" policy, **When** an Admin retires it, **Then** its lifecycle status becomes "Retired" — the document and its full history remain visible, but it is clearly marked as no longer in force.
5. **Given** an "Approved" or "Published" policy, **When** anyone with edit access changes its title or body, **Then** its lifecycle status resets to "Draft" and it must be resubmitted and re-approved before it can be published (or re-published) again.
6. **Given** a policy that has been edited multiple times, **When** a consultant opens its version history, **Then** every prior version's title and body are visible, each labeled with who saved it and when, in order.
7. **Given** a policy that has left Draft (In Review, Approved, Published, or Retired), **When** the governance assessment that originally suggested it is regenerated, **Then** the policy's title, body, and lifecycle status are left completely untouched, regardless of whether it was ever hand-edited.
8. **Given** a policy still in Draft that has never been hand-edited, **When** its source assessment is regenerated, **Then** it continues to update automatically exactly as it does today (unchanged behavior).

---

### User Story 2 - Flagging a published policy that's due for review (Priority: P2)

A published policy needs periodic review to stay current — a consultant wants to set a review-due date on it and have the Policy Library visibly flag it once that date has passed, so nothing published quietly goes stale.

**Why this priority**: Meaningful on its own once User Story 1 exists (a policy needs to be Published before "due for review" means anything), and it's a small, self-contained addition — a date field and a visible flag, no workflow changes.

**Independent Test**: Publish a policy, set a review-due date in the past, and confirm the Policy Library visibly flags it as needing review. Set a future date and confirm it is not flagged.

**Acceptance Scenarios**:

1. **Given** any policy, **When** an Editor sets a review-due date on it, **Then** the date is saved and shown on the policy, independent of its lifecycle status.
2. **Given** a "Published" policy whose review-due date has passed, **When** viewing the Policy Library, **Then** that policy is visibly marked as needing review.
3. **Given** a "Published" policy whose review-due date is in the future (or unset), **When** viewing the Policy Library, **Then** it carries no such flag.
4. **Given** a policy not currently "Published" (Draft, In Review, Approved, or Retired), **When** its review-due date has passed, **Then** it is not flagged as needing review (the flag only applies to what's actually in force).

---

### User Story 3 - Recording who has acknowledged a published policy (Priority: P3)

Once a policy is published, a consultant needs to track, on behalf of the client's people, who has read and acknowledged it — the same way a paper sign-off sheet would, since the people in this app's directory don't have logins of their own.

**Why this priority**: Genuinely useful but the most self-contained of the three — it only attaches to a policy once Published (User Story 1), doesn't affect the approval workflow, and no other part of this feature depends on it.

**Independent Test**: Publish a policy, mark two people from the workspace's directory as having acknowledged it (with a date each), confirm both appear as acknowledged, then unmark one and confirm it reverts to not-acknowledged.

**Acceptance Scenarios**:

1. **Given** a "Published" policy, **When** an Editor marks a person from the workspace's people directory as having acknowledged it, **Then** that person appears as acknowledged, with the date recorded.
2. **Given** a person already marked as having acknowledged a policy, **When** an Editor unmarks them, **Then** they revert to not-acknowledged and the record is removed.
3. **Given** a policy not yet "Published" (Draft, In Review, or Approved), **When** viewing it, **Then** no acknowledgement tracking is offered — there is nothing to acknowledge yet.
4. **Given** a "Retired" policy that was previously acknowledged while Published, **When** viewing it, **Then** its prior acknowledgement records are preserved and still visible (retiring does not erase history).

---

### Edge Cases

- What happens to a policy's acknowledgement records if the workspace later removes the underlying Person from its directory? They are removed along with the person, the same way every other person-linked record in this app already behaves.
- What happens if a policy is deleted outright (already-existing capability) while it has version history and/or acknowledgements? All of it — versions and acknowledgements — is deleted with it; nothing here changes the existing delete behavior.
- What happens if an Editor tries to submit for review, or an Admin tries to approve/publish/retire, a policy that is not in the correct starting state (e.g., approving a Draft that was never submitted, or publishing a policy that's still In Review)? The action is rejected with a clear message naming the policy's actual current state; nothing changes.
- What happens to a policy's version history and lifecycle status when it is first created (hand-written or AI-drafted)? It starts as Draft with exactly one version (its initial content) — no separate "version 0."
- What happens when a hand-managed policy in Draft (never submitted) has its source checklist item's assessment regenerated? It continues to behave exactly as today — regeneration is blocked only by the existing `handManaged` protection, unchanged for anything still in Draft.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST track a lifecycle status on every policy, independent of its existing "recommendation disposition" status (Open/Edited/Done/Dismissed): Draft, In Review, Approved, Published, or Retired.
- **FR-002**: Every policy MUST start in the Draft lifecycle status when first created, whether AI-drafted or hand-written.
- **FR-003**: System MUST allow an Editor (or higher) to submit a Draft policy for review, moving it to In Review.
- **FR-004**: System MUST allow an Admin to approve a policy that is In Review, moving it to Approved and recording who approved it and when.
- **FR-005**: System MUST allow an Admin to publish an Approved policy, moving it to Published and recording an effective date (defaulting to today, changeable).
- **FR-006**: System MUST allow an Admin to retire a Published policy, moving it to Retired, without deleting the policy or its history.
- **FR-007**: System MUST reject any lifecycle transition attempted from the wrong starting status, with a message naming the policy's actual current status.
- **FR-008**: System MUST reset a policy's lifecycle status to Draft whenever its title or body is changed while it is Approved or Published, so that "Approved" and "Published" always reflect the exact content that was reviewed.
- **FR-009**: System MUST keep a complete, ordered version history for every policy — every saved change to its title or body creates a new retrievable version, recording who made the change and when, starting with the version created at the policy's own creation.
- **FR-010**: System MUST NOT let the governance assessment's regeneration process silently overwrite any policy whose lifecycle status is anything other than Draft, regardless of whether that policy was ever hand-edited.
- **FR-011**: System MUST allow an Editor (or higher) to set or change a review-due date on any policy, independent of its lifecycle status.
- **FR-012**: System MUST visibly flag, in the Policy Library, any policy that is currently Published and whose review-due date has passed.
- **FR-013**: System MUST allow an Editor (or higher) to mark a person from the workspace's people directory as having acknowledged a Published policy, recording the date, and to later remove that mark.
- **FR-014**: System MUST only offer acknowledgement tracking on a policy that is currently or was previously Published (not on Draft, In Review, or Approved policies).
- **FR-015**: System MUST preserve a policy's acknowledgement records when it is retired.
- **FR-016**: System MUST restrict submitting for review and editing a policy's content to Editor access or higher, matching every other governance-editing action in this app.
- **FR-017**: System MUST restrict approving, publishing, and retiring a policy to Admin access, reflecting the greater trust those actions carry.
- **FR-018**: System MUST leave the existing Risk Register, and the existing "recommendation disposition" status (Open/Edited/Done/Dismissed) on policies and checklist items, completely unchanged by this feature.

### Key Entities

- **Policy** (existing entity, extended): now additionally carries a lifecycle status, an approving person and approval date (once Approved), an effective date (once Published), and an optional review-due date.
- **Policy Version**: an immutable snapshot of a policy's title and body at one point in time, in sequence, each attributed to whoever saved it and when. A policy always has at least one version, created alongside the policy itself.
- **Policy Acknowledgement**: a record that a specific person from the workspace's directory has acknowledged a specific Published policy, and when. A policy may have any number of these; a given person can only be recorded once per policy at a time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can move a policy from Draft through Approved to Published, and back to Draft after an edit, entirely through the Policy Library UI, with no ambiguity at any point about the policy's current status or who is allowed to advance it next.
- **SC-002**: For any policy with edit history, a consultant can retrieve exactly what it said at any prior save, not just its current text.
- **SC-003**: Zero approved or published policies are ever silently altered by an assessment regeneration — this holds regardless of whether the policy was hand-edited, closing the gap in the previous hand-edit-only protection.
- **SC-004**: A consultant can tell, from the Policy Library alone and without opening each policy individually, which published policies are overdue for review.
- **SC-005**: A consultant can record and later correct who has acknowledged a published policy without needing that person to have any account or login of their own.

## Assumptions

- "Admin" and "Editor" refer to this app's existing workspace access levels (Viewer / Editor / Admin); no new access level is introduced.
- The people who can be marked as having acknowledged a policy are drawn from the workspace's existing People directory (the same one RACI and Authority already use) — no new "recipient list" concept is introduced.
- No notification, reminder, or email system is included — review-due flags and pending-approval states are surfaced only when a consultant is looking at the Policy Library, not pushed to anyone.
- This feature applies to the Policy Library only; the Risk Register and the governance checklist's own Open/Edited/Done/Dismissed status are unaffected.
- A workspace-general audit trail covering every governance entity (not just policies) is a separate, not-yet-built feature; this feature's version/approval attribution is scoped to policies only and does not attempt to generalize.
