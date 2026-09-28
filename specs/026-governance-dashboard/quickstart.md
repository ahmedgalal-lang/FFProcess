# Quickstart: Governance Dashboard

1. On a workspace with open risks at several levels (across two aspects),
   one published policy past its review date, and a partly done checklist,
   open Governance: the panel shows the correct counts first.
2. Click "Open High risks": the register shows every open High risk across
   all aspects, labelled, with a Clear control.
3. With an incident, vendor, conflict, training, privacy and treatment
   record in an attention state, each tile appears with the right count.
4. As the Firm Owner, the ethics tile appears; as the E2E Editor, it does not.
5. On a workspace with nothing recorded, the panel says so instead of zeros.

## Automated verification

- `pnpm vitest run tests/unit/governance-dashboard.test.ts`
- `pnpm exec playwright test tests/e2e/governance-dashboard.spec.ts`
