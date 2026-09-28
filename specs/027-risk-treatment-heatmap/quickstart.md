# Quickstart: Risk Treatment Plans & Heat Map

1. Add three risks by hand: High/Critical, High/Critical, Low/Low; close a
   fourth. The heat map shows 2 in High × Critical (labelled High), 1 in
   Low × Low, and doesn't count the closed one.
2. Click the High × Critical cell: the register shows only those two risks.
   Clear the filter: all rows return. Do the same by keyboard.
3. Open a risk's Treatment panel: set strategy Mitigate with a rationale and
   a target of Low × Medium. The row shows current and target levels.
4. Add a treatment action with a role owner and yesterday's due date. The
   risk is flagged "Overdue treatment". Mark the action done: the flag clears.

## Automated verification

- `pnpm vitest run tests/unit/risk-treatment.test.ts tests/integration/governance.test.ts`
- `pnpm exec playwright test tests/e2e/risk-treatment-heatmap.spec.ts tests/e2e/accessibility.spec.ts`
