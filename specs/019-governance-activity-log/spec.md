# Feature Specification: Governance Activity Log

**Feature Branch**: `019-governance-activity-log`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Give the Governance area a unified audit trail: a single, append-only, workspace-scoped log recording who did what to which governance record and when — across aspects, the assessment (summary edits and regenerate runs), checklist items, risks, and policies — visible as one chronological activity feed on the Governance page."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seeing who touched a risk or an aspect, and when (Priority: P1) 🎯 MVP

A consultant looks at the Governance page and wants to know who renamed an aspect, or who added, edited, or removed a risk, and when — today none of that is recorded anywhere. Aspects and risks are the two kinds of governance record with zero attribution today (Policy already has its own from a prior feature), so closing that gap first delivers the most new visibility for the least work.

**Why this priority**: These are the two entity types with the biggest gap — literally no "who" today — and proving the pattern (a shared, append-only log, read on the Governance page) on them validates the whole feature before extending it further.

**Independent Test**: Add, rename, and delete an aspect; add, edit, and delete a risk. Confirm each action produces one new entry in the activity feed naming who did it, what happened, and when, and that a deleted risk or aspect's entries still read correctly (the record they describe is gone, but its name and the fact something happened to it are not).

**Acceptance Scenarios**:

1. **Given** an aspect is added, renamed, or deleted, **When** viewing the Governance page's activity feed, **Then** a new entry appears at the top naming the aspect, what happened, who did it, and when.
2. **Given** a risk is added, edited (score, status, or owner changed), or deleted, **When** viewing the activity feed, **Then** a new entry appears the same way.
3. **Given** a risk or aspect that has since been deleted, **When** viewing entries about it in the feed, **Then** they still read clearly (by the name it had at the time), not as a broken or dangling reference.
4. **Given** two different people acting on the same workspace, **When** each performs a governance action, **Then** the feed correctly attributes each entry to the person who actually did it.

---

### User Story 2 - Checklist items and the assessment itself join the same feed (Priority: P2)

The same visibility extends to a checklist item being added, edited, or its status changed, to a hand-edited executive summary, and to an assessment being generated or regenerated — so the feed becomes a complete record of everything happening under a workspace's Governance area, not just aspects and risks.

**Why this priority**: Meaningful on its own once User Story 1's pattern (log entry + feed) exists — it's the same shape of change, applied to two more entity types, and doesn't depend on anything in User Story 3.

**Independent Test**: Add a checklist item by hand, change its status, and edit an assessment's summary; separately, regenerate an assessment that creates several new checklist items and risks in one run. Confirm each of the first three actions produces its own entry, and the regenerate produces exactly one entry summarizing everything that run added, not one entry per row it created.

**Acceptance Scenarios**:

1. **Given** a checklist item is added by hand, edited, or has its status changed, **When** viewing the activity feed, **Then** a new entry appears naming the item, what happened, who did it, and when.
2. **Given** an assessment's executive summary is edited by hand, **When** viewing the activity feed, **Then** a new entry appears for that edit.
3. **Given** an assessment is generated or regenerated, and that run adds new checklist items and/or risks, **When** viewing the activity feed, **Then** exactly one entry appears for the run, describing what it added overall (e.g. how many new checklist items, how many new risks) — not a separate entry for every row the run created.

---

### User Story 3 - Every policy action joins the same feed too (Priority: P3)

A policy being created, submitted for review, approved, published, retired, deleted, have its review-due date changed, or have someone's acknowledgement marked or unmarked, all show up in the same feed alongside everything else — so a consultant never has to check two different places to answer "what happened in Governance today."

**Why this priority**: Policies already have their own detailed version history and approval attribution from a prior feature, so this is the most complete but least urgent slice — it rounds the feature out rather than closing a real blind spot, since a policy's own history page already answers "who approved this."

**Independent Test**: Create, submit, approve, publish, and retire a policy, and separately mark and unmark someone's acknowledgement of it. Confirm each action produces its own entry in the same feed as aspects, risks, and checklist items, without duplicating or replacing the policy's own version history.

**Acceptance Scenarios**:

1. **Given** a policy moves through any lifecycle step (created, submitted, approved, published, retired) or is deleted, **When** viewing the activity feed, **Then** a new entry appears for that step.
2. **Given** a policy's review-due date is set or cleared, or someone's acknowledgement is marked or unmarked, **When** viewing the activity feed, **Then** a new entry appears for that action.
3. **Given** a policy's own detailed version history (from the earlier Policy Lifecycle feature), **When** comparing it to this feed's entries about the same policy, **Then** the feed's entries are a short, one-line summary of each action, not a duplicate of the full content history.

---

### Edge Cases

- What happens to activity log entries when the whole Workspace they belong to is deleted? They are deleted along with everything else in that workspace, the same as every other workspace-scoped record.
- What happens if a governance action fails partway through (e.g. a validation error)? No log entry is written — only a successfully completed action is recorded.
- What happens when the feed has far more than the page size worth of entries? The most recent page's worth loads first, with a way to load older entries beyond that — never every entry at once.
- What happens to an entry naming a record (aspect, risk, checklist item, or policy) that has since been deleted? It keeps reading exactly as it did when written — the name it captured at the time, not a live lookup that would otherwise show nothing or an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST record one activity entry every time an aspect is added, renamed, or deleted.
- **FR-002**: System MUST record one activity entry every time a risk is added, edited, or deleted.
- **FR-003**: System MUST record one activity entry every time a checklist item is added, edited, or has its status changed.
- **FR-004**: System MUST record one activity entry every time an assessment's summary is hand-edited.
- **FR-005**: System MUST record exactly one activity entry per assessment generate-or-regenerate run, describing what that run added overall, regardless of how many checklist items or risks it created.
- **FR-006**: System MUST record one activity entry every time a policy is created, deleted, or moves through a lifecycle step (submitted, approved, published, retired).
- **FR-007**: System MUST record one activity entry every time a policy's review-due date is set or cleared, or an acknowledgement is marked or unmarked.
- **FR-008**: Every activity entry MUST record who performed the action, what kind of record it concerned, a human-readable name for that record as it was at the time, a short description of what happened, and when.
- **FR-009**: An activity entry MUST remain fully readable after the record it describes has been deleted — it MUST NOT depend on that record still existing.
- **FR-010**: System MUST NOT record an activity entry for an action that failed or was rejected (e.g. a validation error, a permission refusal) — only for one that completed.
- **FR-011**: System MUST NOT offer any way to edit or delete an activity entry through the application — the feed is append-only.
- **FR-012**: The activity feed MUST be visible to anyone with read access to the workspace (Viewer and above) — it is not restricted to a higher access level than the rest of the Governance page.
- **FR-013**: The activity feed MUST show entries most-recent-first, and MUST NOT require loading the entire history at once to see the latest activity.

### Key Entities

- **Activity Entry**: one record of a single completed governance action — which workspace, what kind of governance record it concerned (aspect, assessment, checklist item, risk, or policy), that record's name at the time, a short description of what happened, who did it, and when. Independent of the record it describes — it survives that record being deleted or changed further.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any aspect, risk, checklist item, assessment summary edit, or policy action performed after this ships, a consultant can find, from the Governance page alone, who did it and when — with zero cases of "no record exists."
- **SC-002**: A record's deletion never breaks its own history — every prior activity entry about it remains fully readable, by name, after it's gone.
- **SC-003**: Regenerating an assessment that finds several new checklist items and risks in one run produces exactly one feed entry for that run, not one per item it created.
- **SC-004**: A consultant can answer "what happened in this workspace's Governance area recently" by looking in exactly one place, covering every kind of governance record, not just policies.

## Assumptions

- "Viewer and above" refers to this app's existing workspace access levels (Viewer / Editor / Admin); reading the feed needs no new, stricter permission of its own.
- The feed's page size (a fixed, reasonable number of the most recent entries, with a way to load older ones) is an implementation detail left to planning — no specific count is a product requirement here.
- This feature is scoped to the Governance area only; a general, product-wide audit trail covering Process Mapping, RACI, Authority Matrix, or workspace membership changes is a separate, not-yet-built feature.
- No notification, alert, or digest is built on top of the feed — it is a page a consultant chooses to look at, not something pushed to them.
- Filtering, search, and export of the feed are out of scope for this first version — a flat, most-recent-first list is the whole UI.
