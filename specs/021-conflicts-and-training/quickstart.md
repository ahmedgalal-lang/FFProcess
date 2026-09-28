# Quickstart: Conflicts of Interest & Training Records

1. Record a conflict for a person (description, related party, date). It
   shows as Declared. Move it through Under review and Mitigated (with a
   note) to Closed; the register separates it from open ones.
2. Define "Anti-bribery" with a 12-month validity. Record one completion
   today (Current) and one 13 months ago (Expired); one 11.5 months ago
   shows Expiring soon.
3. Define "Induction" with no validity period; its completions never expire.
4. Delete "Anti-bribery": the confirmation says 3 completions will go.

## Automated verification

- `pnpm vitest run tests/unit/training.test.ts tests/integration/people-governance.test.ts`
- `pnpm exec playwright test tests/e2e/conflicts-and-training.spec.ts`
