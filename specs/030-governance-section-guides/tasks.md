# Tasks: Governance Section Guides

- [X] T001 Write `tests/unit/section-guides.test.ts`: all nine sections present, each with a description, at least one why paragraph, steps, good and warning signs.
- [X] T002 Move the approved mockup copy into `lib/domain/section-guides.ts`, adding the Governing policy guide.
- [X] T003 Build `section-guide.tsx`.
- [X] T004 Place a guide beside each section heading: dashboard, profile form, assessment, governing policy panel, checklist, risk register, policy library, activity log, and the Key Control Points divider.
- [X] T005 Write `tests/e2e/section-guides.spec.ts` (open, tabs, Esc and focus return, one at a time, axe).
- [X] T006 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
      Result: clean; Vitest 820/820; governance, accessibility and viewer e2e 65/65.
