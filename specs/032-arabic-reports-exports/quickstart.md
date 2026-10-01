# Quickstart: validating Arabic reports and exports

## Prerequisites

- Postgres running; `pnpm exec prisma migrate deploy && pnpm exec prisma generate`; `pnpm db:seed`.
- Optional: `GEMINI_API_KEY` set. Without it, the scenarios marked (AI) show the fallback notice instead.

## Scenarios

1. **Picker language**
   - Sign in, open Acme Industrial → Export.
   - The report language defaults to the interface language. Choose Arabic.
   - The status line shows how many entries are translated.
2. **(AI) Translate now**
   - Click Translate now. The status says all entries are translated, or names how many are left and why.
3. **Arabic report**
   - Open the report. The page is right to left, headings are Arabic, entries are Arabic, codes and people's names are unchanged, and diagrams flow left to right.
   - The axe scan of the report passes.
4. **Reuse**: open the report again. No AI calls are made (see the server log), and the wording is identical.
5. **Invalidation**: rename a step, then open the Arabic report. Only that step's text is translated again.
6. **Correction**
   - Export → Translations: search for the step, change its Arabic, and save.
   - Open the report again. The corrected wording appears everywhere that text is used.
7. **Deck and files**
   - Download the deck in Arabic: the text runs right to left.
   - From a process, download the RACI and authority spreadsheets and PDFs in Arabic. Sheets are right to left, PDFs show shaped Arabic, and the RACI letters are unchanged.
8. **No AI**
   - Unset `GEMINI_API_KEY` and use a fresh workspace.
   - The Arabic report has Arabic headings, entries as typed, and a notice naming the count.
9. **English unchanged**: the English report and exports match before and after; the existing e2e tests still pass.

## Commands

```bash
pnpm exec tsc --noEmit && pnpm exec eslint --quiet app lib tests
pnpm exec vitest run
pnpm exec playwright test tests/e2e/arabic-reports.spec.ts
```
