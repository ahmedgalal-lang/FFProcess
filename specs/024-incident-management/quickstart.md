# Quickstart: Incident & Issue Management

1. Log an incident (High, IT & security, linked to a process). It appears as
   Open with days open.
2. Try to move it to Resolved without a root cause: refused with a message.
   Add a root cause, then Resolve, then Close.
3. Add two corrective actions: one due yesterday (flagged Overdue), one
   marked Done. Closing with an open action shows a warning but succeeds.
4. Log another incident flagged as a personal data breach, aware 60 hours
   ago: it shows 12 hours left. Record the regulator notification: the
   countdown is replaced by the notification date.
5. Link an incident to an existing risk; the risk names the incident.

## Automated verification

- `pnpm vitest run tests/unit/incidents.test.ts tests/integration/incidents.test.ts`
- `pnpm exec playwright test tests/e2e/incidents.spec.ts`
