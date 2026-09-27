# Feature Specification: Custom Governance Aspects

**Feature Branch**: `017-custom-governance-aspects`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Let a consultant add, rename, and delete the governance 'aspect' tabs themselves (Board Structure, Risk & Internal Controls, Ethics Policy, Compensation, ESG, Data Integrity, Accessibility) — today these seven are a fixed, built-in list shared by every workspace; nothing lets a consultant add a client-specific one, rename one to match how a client actually talks about it, or remove one that plainly doesn't apply to a given engagement. Reported directly by the user: 'also for all aspects, i need edit, delete and add options' — confirmed via a direct follow-up question that this means managing the aspect tabs themselves. Aspects become per-workspace. Deleting an aspect must not silently destroy a risk or a policy that came from it — its own assessment (summary + checklist) is deleted, but any risk/policy it had sourced survives, becoming indistinguishable from one added by hand. Renaming only changes the label. A new aspect starts empty and appends after the existing ones. No duplicate names within a workspace. Every existing workspace's seven built-in aspects, and everything already tied to one, must carry over exactly as they read today."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adding an aspect this client actually needs (Priority: P1)

A consultant is running a governance assessment for a client whose engagement raises a concern none of the seven built-in aspects name on its own — say, a Data Privacy obligation distinct from Data Integrity. Today there is nowhere to put it; every governance action has to be shoehorned into an aspect that doesn't quite fit, or left out of the assessment altogether.

**Why this priority**: Without this, the feature does nothing — a consultant still can't express a client-specific concern as its own aspect, which is the entire reported gap.

**Independent Test**: Add a new aspect with a name that doesn't collide with any existing one. Confirm it appears as its own tab, reads as empty (no assessment yet), and behaves exactly like any built-in aspect from that point on — profile-gated "Generate assessment," hand-added checklist items, risks, and policies all work on it immediately.

**Acceptance Scenarios**:

1. **Given** a workspace with its usual aspects, **When** the consultant adds a new one with a name not already in use, **Then** it appears as an additional tab, after the existing ones, reading as empty.
2. **Given** the newly added aspect, **When** the consultant works with it — generates an assessment, adds a checklist item by hand, adds a risk or a policy — **Then** it behaves exactly as any built-in aspect already does, with no missing capability.
3. **Given** an existing aspect name, **When** the consultant tries to add another aspect with that exact name, **Then** the attempt is rejected and the existing aspect is untouched.

---

### User Story 2 - Renaming an aspect to match how the client actually talks about it (Priority: P2)

A consultant finds that a built-in aspect's name doesn't match the client's own vocabulary — "ESG" might need to read as "Sustainability" for one client. Everything already recorded under that aspect (its assessment, its risks, its policies) should keep working under the new name.

**Why this priority**: Useful, but secondary to being able to add an aspect at all (User Story 1) — a consultant can work around a mismatched name; they cannot work around a missing aspect.

**Independent Test**: Rename an aspect that already has an assessment, a risk, and a policy attached. Confirm the tab now reads under the new name, and every one of those three still shows up under it, unchanged apart from the label.

**Acceptance Scenarios**:

1. **Given** an aspect with an assessment, a risk, and a policy already on it, **When** the consultant renames it, **Then** the tab reads under the new name and all three are still there, exactly as before.
2. **Given** the renamed aspect, **When** the consultant tries to rename another aspect to the name just vacated, **Then** that is now allowed (the old name is free again).
3. **Given** an aspect, **When** the consultant tries to rename it to a name another aspect in the same workspace already has, **Then** the attempt is rejected and neither aspect's name changes.

---

### User Story 3 - Removing an aspect that plainly doesn't apply, without losing what it already found (Priority: P2)

A consultant is working an engagement where one of the built-in aspects (say, Compensation) is genuinely out of scope for this client and just clutters the tab list. They remove it — but a risk it had already surfaced still matters and must not vanish with it.

**Why this priority**: Tidying the tab list matters less than the two additive capabilities above, and the "don't lose the risk" guarantee is what makes deleting safe enough to offer at all — hence bundled with, not split from, the delete capability itself.

**Independent Test**: On an aspect with an assessment, a risk, and a policy attached, delete the aspect. Confirm its tab is gone, its assessment (summary and checklist) is gone with it, but the risk and the policy it had sourced are still on the Risk Register and Policy Library respectively, now reading as added by hand.

**Acceptance Scenarios**:

1. **Given** an aspect with an assessment, a risk, and a policy sourced from it, **When** the consultant deletes the aspect, **Then** its tab and its assessment (summary + checklist) are gone, but the risk and the policy remain, each now reading as added by hand rather than naming the deleted aspect.
2. **Given** a workspace's aspect list, **When** the consultant deletes one of the original seven built-in aspects, **Then** it is removed exactly the same way a consultant-added aspect would be — nothing distinguishes a built-in aspect from an added one once this ships.
3. **Given** an aspect the consultant is currently viewing, **When** they delete it, **Then** the view moves to showing a remaining aspect rather than a now-nonexistent one.

---

### Edge Cases

- What happens to a workspace's aspect list the moment this feature ships, before anyone has touched it? Every workspace already has its seven built-in aspects, and every assessment, risk, and policy already tied to one of them reads exactly as it did before — nothing about them changes in appearance or behavior on its own.
- What happens if a consultant deletes every aspect in a workspace? The workspace is left with no aspect tabs and no way to add a checklist item, risk, or policy tied to one — an intentionally reachable (if unusual) state, not one this feature needs to prevent; risks and policies added by hand remain unaffected either way, since they were never tied to an aspect.
- What happens to a risk or a policy that was already reading "Added manually" (never tied to any aspect) when an unrelated aspect is deleted? Nothing — it was never tied to the deleted aspect and is untouched.
- What happens if two people try to add the same aspect name at the same time? One succeeds; the other is rejected as a duplicate, the same as adding it a moment later would be.
- What happens to which tab is showing when a consultant deletes the tab they're currently viewing? The view falls back to showing a remaining aspect (or the empty, no-aspects state, per the case above) rather than a blank tab pointing at something that no longer exists.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A workspace's governance aspects MUST be specific to that workspace — adding, renaming, or deleting an aspect in one workspace MUST NOT affect any other workspace's aspect list.
- **FR-002**: The consultant MUST be able to add a new aspect to a workspace, giving it a name; it MUST appear as its own tab, after the existing ones, and MUST start with no assessment (the same empty state a built-in aspect has before its first "Generate assessment" run).
- **FR-003**: The consultant MUST be able to rename an existing aspect; this MUST change only its displayed name — every assessment, checklist item, risk, and policy already tied to it MUST remain tied to it, unaffected.
- **FR-004**: The consultant MUST be able to delete an existing aspect. Deleting it MUST remove that aspect's own assessment (its summary and its phased checklist) along with it.
- **FR-005**: Deleting an aspect MUST NOT delete any risk or policy it had sourced — each MUST survive the deletion and MUST subsequently read the same way a risk or policy added by hand already reads, with nothing pointing at the now-deleted aspect.
- **FR-006**: Every aspect in a workspace — one of the seven a workspace starts with, or one a consultant adds later — MUST be equally renameable and deletable; nothing may distinguish a "built-in" aspect from an added one in what a consultant is allowed to do to it.
- **FR-007**: Two aspects in the same workspace MUST NOT be allowed to carry the identical name; attempting to add or rename one into a collision MUST be rejected, and MUST leave every existing aspect's name unchanged.
- **FR-008**: Every workspace that exists before this feature ships MUST, the moment it ships, have exactly the same seven aspects it has today, and every assessment, checklist item, risk, and policy already tied to one of them MUST read exactly as it did before — this is a carry-over of existing data, not a fresh start.
- **FR-009**: Managing a workspace's aspect list (adding, renaming, deleting) MUST require the same workspace access level every other governance-editing control in this product already requires; a viewer-level user MUST NOT be offered these controls.
- **FR-010**: Deleting the aspect currently being viewed MUST leave the consultant looking at a remaining aspect (or the appropriate empty state, if none remain) rather than a tab for an aspect that no longer exists.
- **FR-011**: A workspace created after this feature ships MUST start with the same seven aspects an existing workspace already has today, fully editable from that point on exactly like any other aspect (FR-006) — the day-one experience of opening Governance on a brand-new workspace MUST NOT regress to an empty tab list.

### Key Entities

- **Governance Aspect**: A new, per-workspace entity — a name and the workspace it belongs to. Replaces today's fixed, built-in list of seven, which becomes the seven rows every existing workspace is migrated to hold. Every existing governance entity below now points at one of these rows instead of a fixed value.
- **Governance Assessment**: Existing entity, otherwise unchanged. Belongs to exactly one aspect (its focus area) rather than one of a fixed set of values; deleted along with its aspect.
- **Governance Checklist Item**: Existing entity, unchanged — belongs to its assessment, which belongs to an aspect; deleted along with the assessment when the aspect is deleted.
- **Governance Risk / Governance Policy Draft**: Existing entities, unchanged in shape. Each may still be sourced from a checklist item (and therefore, transitively, an aspect) or added by hand; deleting an aspect clears that connection rather than deleting the risk or policy itself — the same survival guarantee already established for a risk outliving the assessment run that found it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can add a client-specific aspect and have it fully usable (assessment, checklist, risks, policies) in under a minute, with no missing capability compared to a built-in aspect.
- **SC-002**: Zero existing workspaces lose or change the appearance of any aspect, assessment, checklist item, risk, or policy the moment this feature ships.
- **SC-003**: Deleting an aspect that has a risk and a policy attached always leaves both fully intact and reachable afterward, on every attempt.
- **SC-004**: A consultant can rename an aspect and confirm, without hunting, that everything already recorded under it is still there under the new name.
- **SC-005**: A brand-new workspace, created after this feature ships, opens Governance with the same seven starting aspects an existing workspace already has — never an empty tab list.

## Assumptions

- **No reordering capability is in scope.** A newly added aspect appends after the existing ones; nothing here lets a consultant change the order of the tab list itself.
- **No confirmation-flow design is specified beyond "the consultant MUST be able to."** Deleting an aspect is a destructive action by nature (FR-004/FR-005 already scope exactly what does and doesn't survive it); the product's existing confirm-before-delete pattern, already used for risks, policies, and checklist items on this same page, is assumed to extend here rather than being redesigned.
- **Deleting the last remaining aspect in a workspace is allowed, not blocked.** An empty aspect list is an unusual but valid state (Edge Cases) — this spec does not require preventing it, e.g. by forcing at least one aspect to always exist.
- **Out of scope**: any change to what an aspect's assessment, checklist, risks, or policies actually are, or how they are generated or individually edited — that is fully covered by spec 012 and this session's own extensions to it. This spec is only about the aspect list itself.
- **Out of scope**: any workspace-to-workspace copying or templating of a custom aspect. An aspect added in one workspace exists only there (FR-001); this spec does not add a way to reuse one across engagements.
