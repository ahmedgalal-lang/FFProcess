# Contract: Translation Service and Export URLs

## `translateTexts(workspaceId, texts, locale)` — `lib/translation/translate.ts` (server only)

```ts
type TranslationOutcome = {
  /** The text to print for an entry: its translation, or the entry as typed. */
  lookup: (text: string) => string;
  /** Distinct translatable entries asked about. */
  total: number;
  /** Distinct translatable entries still without a translation after this call. */
  untranslated: number;
  /** Why some were left untranslated, as the AI reported it, or null. */
  failure: string | null;
  /** The kind of failure, for wording it in the reader's language. */
  failureKind: "NOT_CONFIGURED" | "REQUEST_FAILED" | null;
};
translateTexts(workspaceId: string, texts: Iterable<string>, locale: Locale, options?: { allowAi?: boolean }): Promise<TranslationOutcome>
```

- `locale === "en"`: `lookup` is the identity, with no queries.
- `allowAi: false` reads saved rows only. The picker uses this for its status count.
- The caller must already have checked the viewer's access to `workspaceId`.

## `localizeReportData(data, locale, options?)` — `lib/reports/localize-report-data.ts` (server only)

Returns `{ data: ReportData; total: number; untranslated: number; failure: string | null; failureKind }`. The pure halves, `collectReportTexts` and `applyReportTranslations`, live in `lib/reports/localize-report.ts`. The server wrapper lives in `lib/reports/localize-report-data.ts`. Entries are replaced via `mapReportText`. Names of people, company, firm, codes, ids, colours and numbers are untouched.

## Server actions — `lib/actions/translations.ts`

| Action | Access | Input | Result |
|---|---|---|---|
| `prepareReportTranslations` | EDITOR | `{ workspaceId }` (the whole report) | `{ total, untranslated, failureKind }` |
| `updateTranslation` | EDITOR | `{ workspaceId, translationId, text }` (1–20,000 chars) | sets `origin = MANUAL`, `editedById` |
| `resetTranslation` | EDITOR | `{ workspaceId, translationId }` | deletes the row |

Each action returns `NOT_FOUND` for a translation outside the workspace, and `VALIDATION_ERROR` for empty text.

## URLs

| URL | Parameter |
|---|---|
| `/reports/[workspaceId]?ids=…&lang=ar` | the printed report in Arabic |
| `/api/export/report/[workspaceId]?ids=…&lang=ar` | the deck in Arabic |
| `/api/export/raci/[processId]?format=pdf\|xlsx&lang=ar` | the RACI matrix |
| `/api/export/authority/[processId]?format=pdf\|xlsx&lang=ar` | the authority matrix |
| `/api/export/process-map/[processId]?lang=ar` | the process map |
| `/api/export/org-chart/[workspaceId]?lang=ar` | the org chart |
| `/workspaces/[workspaceId]/export/translations?q=…` | review and correct |

A missing or unknown `lang` means the interface locale (the cookie), and otherwise English.

## Who may ask the AI

Only an editor's request translates missing entries: the report page, the deck, the per-process exports and **Translate now**. A viewer's export reads saved translations only.
