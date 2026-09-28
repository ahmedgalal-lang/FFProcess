# Quickstart: Governance & Risk in the Exported Report

## Prerequisites

Dev server running, signed in as the seeded Firm Owner, on `workspace-acme`.

## Scenario 1 — Risk Register in both formats (User Story 1)

1. On the Governance page, add two risks by hand (different levels) and
   mark one Closed.
2. Open Export Report, confirm "Governance & Risk" is listed in the
   arrangement panel, ticked, then preview the report.
3. Confirm a "Governance & Risk" section appears after the Value Chain and
   before "Processes in This Report", listing both risks with likelihood,
   impact, level, status and owner, the open one first.
4. Download the PPTX and confirm it contains a Risk Register slide.
5. Untick the section, preview again, and confirm it's gone from both.

## Scenario 2 — Policy index (User Story 2)

1. Add a policy by hand and publish it (Policy Lifecycle, spec 018).
2. Preview the report: the section lists the policy's title, "Published",
   and its effective date; an unpublished policy shows no date.

## Scenario 3 — Assessment summaries (User Story 3)

1. Write an executive summary by hand on one aspect.
2. Preview the report: that aspect's summary appears under its name; aspects
   without a summary are absent.

## Scenario 4 — Empty workspace

1. On a workspace with no governance records, preview the report: the
   section shows three specific "nothing recorded yet" messages. The PPTX
   has no governance slide at all.

## Automated verification

- `pnpm vitest run tests/unit/report-arrangement.test.ts tests/unit/governance-report.test.ts`
- `pnpm exec playwright test tests/e2e/governance-report.spec.ts tests/e2e/report-composer.spec.ts tests/e2e/report-print.spec.ts`
