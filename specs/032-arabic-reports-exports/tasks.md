# Tasks: Arabic Reports and Exports

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

## Phase 1: Setup

- [x] T001 Add the `ContentTranslation` model and `TranslationOrigin` enum to `prisma/schema.prisma` (relations on Workspace and User). Create the migration and generate the client.
- [x] T002 [P] Add the IBM Plex Sans Arabic Regular and Bold WOFF files and the OFL licence in `lib/export/fonts/`.

## Phase 2: Foundational (blocks every story)

- [x] T003 [P] Write `lib/translation/translatable.ts`: `isTranslatable`, `normalizeSource` and `sourceHash`, with unit tests in `tests/unit/translatable.test.ts`.
- [x] T004 [P] Write `lib/translation/ai-translate.ts`: batch planning, the Gemini structured call and output validation, with unit tests for batching and validation in `tests/unit/ai-translate.test.ts`.
- [x] T005 Write `lib/translation/translate.ts` (`translateTexts`): dedupe, read saved rows, translate the missing ones with bounded concurrency, save with skipDuplicates, and return the outcome. Integration tests in `tests/integration/translation.test.ts`: reuse, invalidation on change, MANUAL never overwritten, workspace isolation, the no-AI fallback.
- [x] T006 Add the typed report and export dictionaries in `lib/i18n/messages/report.en.ts` and `report.ar.ts`, wired into `Messages` as `report`.

## Phase 3: User Story 1 — the Arabic report, entries included (P1) 🎯 MVP

- [x] T007 [US1] Write `lib/reports/localize-report.ts`: `mapReportText` (one list of entry fields) and `localizeReportData`, with unit tests in `tests/unit/localize-report.test.ts` covering visited fields, untouched names, codes and ids, and the collect/apply round trip.
- [x] T008 [US1] `app/reports/[workspaceId]/page.tsx`: read `lang`, localize the data, and pass the locale and notice to the preview.
- [x] T009 [US1] `app/reports/[workspaceId]/export-preview.tsx` (and `printed-map/*`): render all fixed wording from the report dictionary through a nested `LocaleProvider`. Set `dir`/`lang` on the root and localized dates. Show a print-hidden untranslated notice. Keep diagrams LTR.
- [x] T010 [US1] Arabic font on any `[lang="ar"]` element in `app/globals.css`.

## Phase 4: User Story 2 — choosing the report language (P1)

- [x] T011 [US2] `export/page.tsx` and `export-picker-form.tsx`: add a language choice (default: interface locale) carried as `lang` on the report and deck links. In Arabic, show the translated/pending count and **Translate now**, which calls `prepareReportTranslations` in `lib/actions/translations.ts`.
- [x] T012 [US2] e2e `tests/e2e/arabic-reports.spec.ts`: an English interface producing an Arabic report from seeded translations (rtl, Arabic headings, Arabic entries, codes kept, axe clean); the fallback notice when an entry has no translation and the AI is unavailable.

## Phase 5: User Story 3 — deck, spreadsheets, PDFs (P2)

- [x] T013 [US3] `lib/export/pptx/report-pptx.ts` plus the route: dictionary wording, `rtlMode`/`lang`/right alignment for Arabic, localized data.
- [x] T014 [US3] `lib/export/xlsx.ts` plus the RACI and authority routes: Arabic headings, right-to-left sheets, translated entries.
- [x] T015 [US3] `lib/export/pdf/*` plus the routes: register the Arabic font, rtl direction and row order, dictionary wording, translated entries.
- [x] T016 [US3] Pass `lang` from the per-process export buttons (the interface locale) and from the picker. No button change was needed: a link without `lang` already means the interface locale.
- [x] T017 [US3] Tests: unit tests that the Arabic workbook is right to left with Arabic headings and that the deck builds in Arabic; an e2e download check.

## Phase 6: User Story 4 — correcting translations (P2)

- [x] T018 [US4] Add `updateTranslation` / `resetTranslation` in `lib/actions/translations.ts` (EDITOR, workspace-scoped), with integration tests.
- [x] T019 [US4] Build the page `app/(app)/workspaces/[workspaceId]/export/translations/` (search, edit, reset, read-only for viewers), with a link from the export picker.
- [x] T020 [US4] e2e: correct a translation, and the report shows the correction. Axe scan of the page.

## Phase 7: Polish

- [ ] T021 Full suites (tsc, eslint, Vitest, Playwright); check English exports are unchanged; update spec 031's stage-3 tasks to point here.

## Dependencies

- T001 comes before T005.
- T003 and T004 come before T005, which comes before T007.
- T006 comes before T009, T011, T013, T014 and T015.
- US1 (T007–T010) comes before US2's e2e (T012).
- US3 and US4 can each start once T007 is done.

## Parallel opportunities

- T002, T003, T004 and T006.
- T013, T014 and T015 (different files).
- T018 and T019 alongside US3.

## Implementation strategy

MVP is US1 plus US2: the Arabic printed report chosen on the picker. Then the formats (US3) and corrections (US4).
