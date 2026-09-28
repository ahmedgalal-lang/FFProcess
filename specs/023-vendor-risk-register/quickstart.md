# Quickstart: Vendor & Third-Party Risk Register

1. Add three vendors (Critical, Medium, Low): they list Critical first.
2. Give one a due-diligence review completed 13 months ago with a 12-month
   cycle, and a contract ending in 20 days: it shows "Due diligence overdue"
   and "Renewal within 60 days".
3. Link it to an existing risk: the vendor lists the risk, and the risk
   names the vendor. Delete the risk: the vendor survives, the link is gone.

## Automated verification

- `pnpm vitest run tests/unit/vendors.test.ts tests/integration/vendors.test.ts`
- `pnpm exec playwright test tests/e2e/vendors.spec.ts`
