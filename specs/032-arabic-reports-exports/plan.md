# Implementation Plan: Arabic Reports and Exports

**Branch**: `032-arabic-reports-exports` (work lands on `claude/process-mapping-raci-tool-v1i9lb`) | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

## Summary

Give every report and export a language: English or Arabic. In Arabic:

- The fixed wording comes from typed dictionaries, as the Arabic interface's does (spec 031).
- Every entry is replaced by a saved, workspace-scoped translation of its exact text.
- Missing translations are made by the existing AI integration in batches, saved, and reused.
- Editors can correct a translation on a translations page reached from the export picker.

Entries are swapped in at one point, the report data loader's output, so the printed report and the deck can't disagree. The per-process PDF and spreadsheet routes use the same translation service for the few strings they print.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16.3.7 (App Router), React 19

**Primary Dependencies**:
- Prisma 7 / PostgreSQL
- `@google/genai`, through `lib/ai/gemini.ts`
- `@react-pdf/renderer` 4.6 (textkit with bidi and fontkit shaping)
- `pptxgenjs` 4 (`rtlMode`, `lang`)
- `exceljs` (worksheet `views.rightToLeft`)

**Storage**: one new table, `content_translations`

**Testing**: Vitest (unit and integration against Postgres), Playwright (e2e, axe)

**Target Platform**: Node server and evergreen browsers

**Project Type**: web application, a single Next.js project

**Performance Goals**:
- A repeat Arabic export makes no AI calls and costs a small number of extra queries over English.
- A first export translates in batches with bounded concurrency.

**Constraints**:
- English output is byte-for-byte unchanged.
- No AI key means a working Arabic export with entries as typed.
- Translations never cross workspaces.

**Scale/Scope**: on the order of 1,000 distinct strings for a large workspace.

## Constitution Check

| Principle | How this plan complies |
|---|---|
| I. Type-Safe Full-Stack | The report dictionary is typed (`ar` must match `en`). Translation input and output are validated with zod at the action boundary. |
| II. Shared Domain Model | One `mapReportText` walker defines which report fields are entries. Collecting and applying translations both use it, and both renderers consume its output. |
| III. Test-First for Business Rules | Unit tests cover what counts as translatable, the field walker, and AI output validation. Integration tests cover the store: reuse, invalidation, corrections never overwritten, workspace isolation. |
| IV. Accessible, Data-Dense UI | The Arabic report gets `lang`/`dir` and must pass axe. The translations page uses real labels and a searchable table. |
| V. Workspace Isolation & Least Privilege | Rows carry `workspaceId`, and every read and write is filtered by it. Correcting needs EDITOR (checked server-side); reading needs VIEWER. |
| VI. Simplicity & Incremental Delivery | P1 is the report and the picker language. P2 is the deck, spreadsheets, PDFs and corrections. Translation is keyed by text hash: no per-entity bookkeeping and no change to existing tables. |

Gate: **PASS**, with no violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/032-arabic-reports-exports/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/translation-service.md
└── tasks.md
```

### Source Code (repository root)

```text
prisma/schema.prisma                         # + ContentTranslation
lib/translation/
├── translatable.ts                          # pure: what is an entry worth translating, normalisation, key
├── ai-translate.ts                          # Gemini batch call + output validation
└── translate.ts                             # store-backed translateTexts(workspaceId, texts, locale)
lib/reports/localize-report.ts               # mapReportText walker + localizeReportData
lib/i18n/messages/report.en.ts / report.ar.ts # fixed report and export wording
lib/actions/translations.ts                  # update/reset a translation, prepare a pack (EDITOR)
lib/export/fonts/                            # IBM Plex Sans Arabic (OFL) for PDFs
app/reports/[workspaceId]/                   # ?lang= ; dir/lang on the document; notice banner
app/api/export/report/[workspaceId]/route.ts # ?lang= → localized deck
app/api/export/{raci,authority,process-map,org-chart}/… # ?lang= → localized files
app/(app)/workspaces/[workspaceId]/export/   # language choice, prepare-translations status
app/(app)/workspaces/[workspaceId]/export/translations/ # review and correct
```

**Structure Decision**: Single Next.js project. All new logic sits in `lib/translation` and `lib/reports`, and the renderers only receive localized data plus a dictionary.

## Complexity Tracking

None.
