# Quickstart: Ethics & Whistleblower Case Register

1. As the Firm Owner (Admin), log a case: anonymous, Hotline, Fraud, High.
   It appears as CASE-0001, New, with no reporter field.
2. Log a second case, then delete it while New; log a third: it's CASE-0003
   (numbers are never reused).
3. Triage CASE-0001, move it to Under investigation, assign an investigator,
   add two notes. There's no way to edit or delete a note. Try to delete the
   case: refused.
4. Close it: outcome and closing summary are required.
5. Sign in as the E2E Editor: the Governance page shows no case register at
   all, and a direct request for a case is refused.

## Automated verification

- `pnpm vitest run tests/unit/ethics.test.ts tests/integration/ethics.test.ts`
- `pnpm exec playwright test tests/e2e/ethics-cases.spec.ts`
