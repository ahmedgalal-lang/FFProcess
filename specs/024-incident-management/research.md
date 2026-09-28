# Research: Incident & Issue Management

## Decision 1 — A new Incidents section on the Governance page, workspace-wide

Incidents are workspace records, not aspect records, so the section is not
scoped by the aspect tabs (unlike the checklist, Risk Register and Policy
Library, which the user asked to follow the active tab). It sits below the
Policy Library as its own section.

## Decision 2 — Status transitions are free-form except "Resolved needs a root cause"

Open → Investigating → Resolved → Closed is the normal path, but real
incidents get reopened, so any status can be set from any other, with one
rule enforced server-side: moving to Resolved (or Closed, which implies
resolution) requires a non-empty root cause (FR-002). Simpler than a strict
state machine and matches how the Risk Register's status select works.

## Decision 3 — Personal-data-breach fields live on the incident

`personalDataBreach` (boolean), `breachAwareAt` (timestamp),
`regulatorNotifiedAt` (timestamp, nullable), and
`notificationNotRequiredReason` (text, nullable). The deadline
(`breachAwareAt + 72h`) and the overdue state are derived by a pure
function, not stored. Recording either a notification or a
not-required reason stops the clock (FR-009); the action rejects setting
both.

## Decision 4 — Corrective actions and risk links are their own tables

`GovernanceIncidentAction` (many per incident: description, role/person
owner, due date, done date; Cascade from the incident, SetNull owners) and
`GovernanceIncidentRisk` (join table, Cascade from both sides — deleting
either removes only the link, FR-010).

## Decision 5 — The related process is optional and survives the process

`processId` nullable with `onDelete: SetNull`. Processes in this app are
soft-deleted (`archivedAt`) and restorable, so a link to an archived process
is kept and shown as "(deleted)", and only a hard delete clears it.

## Decision 6 — Pure helpers, unit-tested

`lib/domain/incidents.ts`: `breachDeadline(awareAt)`,
`breachNotificationState(incident, now)` → `{ state: "PENDING" |
"OVERDUE" | "NOTIFIED" | "NOT_REQUIRED" | "N/A", hoursRemaining }`,
`isIncidentActionOverdue(dueDate, doneAt, today)`, `daysOpen(occurredAt,
closedAt, today)`, and `sortIncidents` (open before closed, most severe
first). Computed server-side, passed down as values.
