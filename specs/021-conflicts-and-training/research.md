# Research: Conflicts of Interest & Training Records

## Decision 1 — Code-of-conduct attestation is spec 018's acknowledgement

Publishing a Code of Conduct policy and recording who acknowledged it
(`GovernancePolicyAcknowledgement`) is exactly the attestation the backlog
item named. No second mechanism.

## Decision 2 — Conflicts cascade with their person

A conflict is *about* one person; without them it has no subject. `personId`
is required with `onDelete: Cascade` (FR-009), matching
`GovernancePolicyAcknowledgement`'s choice in spec 018. Same for training
completions.

## Decision 3 — Expiry is derived from the course's validity period

`TrainingCourse.validityMonths` (nullable = never expires) plus the
completion date gives the expiry date; a pure function derives the expiry
date and the state (`CURRENT | EXPIRING_SOON | EXPIRED | NO_EXPIRY`, 30-day
window). Changing a course's validity period re-dates every existing
completion, which is the intended behaviour: the rule changed, not the
training.

## Decision 4 — Deleting a course deletes its completions, with a count

`TrainingCompletion.courseId` Cascade. The delete confirmation names how
many completions will go (an existing pattern: process delete warnings).

## Decision 5 — Its own action and component files

`lib/actions/people-governance.ts`, `governance-conflicts.tsx`,
`governance-training.tsx`.
