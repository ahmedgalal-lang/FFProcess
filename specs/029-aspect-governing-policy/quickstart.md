# Quickstart: A Governing Policy for Every Aspect

1. Open Governance → Board Structure. It says there's no governing policy
   yet. Start from template: Board Charter is suggested first. Use it: a
   Draft "Board Charter" appears as the governing policy, with the
   workspace's name filled in.
2. The Board Structure tab no longer shows the missing-policy marker only
   once the charter is Published: submit, approve and publish it.
3. On Risk & Internal Controls, choose an existing policy from the library
   as its governing policy. Try choosing the Board Charter: refused, it
   already governs Board Structure.
4. Add a custom aspect "Conflicts of Interest": the template picker
   suggests the Conflict of Interest Policy first.
5. Remove a designation: the policy stays in the library, the aspect shows
   the empty state again.
6. The summary panel counts aspects without a published governing policy;
   the exported report lists each aspect with its governing policy.

## Automated verification

- `pnpm vitest run tests/unit/policy-templates.test.ts tests/unit/governing-policy.test.ts tests/integration/governing-policy.test.ts`
- `pnpm exec playwright test tests/e2e/governing-policy.spec.ts`
