# Quickstart: Data Privacy Register

1. Record two processing activities (Payroll, Customer marketing). Mark
   Payroll special-category: it's flagged "DPIA recommended".
2. Start a DPIA on Payroll with High residual risk: it's flagged "may need
   prior consultation". As an Editor, Approve is not offered; as an Admin,
   approve it: Payroll's "DPIA recommended" flag clears.
3. Edit the approved DPIA's mitigations: it returns to Draft.
4. With a personal-data-breach incident logged (spec 024), it's listed in
   the privacy section with its notification state; link it to Payroll.

## Automated verification

- `pnpm vitest run tests/unit/privacy.test.ts tests/integration/privacy.test.ts`
- `pnpm exec playwright test tests/e2e/privacy.spec.ts`
