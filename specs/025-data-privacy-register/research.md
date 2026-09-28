# Research: Data Privacy Register

## Decision 1 — Categories and recipients are free text lists, not taxonomies

Data-subject categories, personal-data categories and recipients vary per
client and per jurisdiction; a fixed taxonomy would be wrong for most. They
are stored as `String[]` (Postgres text arrays, supported by Prisma) and
edited as comma-separated inputs. Lawful basis *is* a closed set (GDPR
Art. 6) and is an enum.

## Decision 2 — DPIA approval is ADMIN-only, like policy approval

Approving a DPIA is a sign-off, the same kind of trust step as approving a
policy (spec 018), so it takes the same access level. Drafting and editing
a DPIA is EDITOR.

## Decision 3 — Flags are derived

"DPIA recommended" (special category and no APPROVED DPIA) and "may need
prior consultation" (a DPIA with HIGH residual risk) are derived by pure
functions in `lib/domain/privacy.ts`, not stored.

## Decision 4 — Breaches are read from the incident log (spec 024)

The privacy section lists incidents with `personalDataBreach = true`, with
their notification state from spec 024's `breachNotificationState`, and a
join table links a breach incident to processing activities. No second
breach record. User Story 3 is built after spec 024.

## Decision 5 — Its own action and component files

`lib/actions/privacy.ts` and `governance-privacy.tsx`, keeping
`governance.ts` from growing further.
