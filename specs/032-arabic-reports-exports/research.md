# Research: Arabic Reports and Exports

## 1. How a translation is identified

- **Decision**: key each translation by workspace, locale and the SHA-256 of the entry's exact text with its outer whitespace trimmed. Keep the source text on the row for the corrections page.
- **Rationale**:
  - Meets FR-006 with no bookkeeping. An edited entry has a new key, so it is translated afresh. An unchanged one hits the saved row.
  - The same text used in several places (a role name across processes) is translated once.
  - No existing table changes.
- **Alternatives considered**:
  - Per-entity, per-field rows (entity id + field + source hash). This is precise, but every renderer would need entity ids, and duplicate text would be translated many times.
  - Columns on each entity (`nameAr` …). Rejected: dozens of columns, and it fits hand entry, not saved AI output.

## 2. Where translations are applied

- **Decision**: apply them to the output of `loadReportData` through one walker, `mapReportText(data, fn)`. The walker lists every entry field once. It runs twice: once to collect the strings, once to replace them.
- **Rationale**:
  - The printed report and the deck already share this data, so they can't drift.
  - Generated sentences in the data (authority rule sentences, control points, role duties, documentation gaps) are fixed English templates filled with names. Translating them as entries is cached like any other.
  - This avoids re-implementing every sentence generator in Arabic.
- **Alternatives considered**: translating inside each renderer. Rejected: two renderers would need two lists of fields.

## 3. AI call

- **Decision**:
  - Use structured output through the existing `generateStructured`. Input is an array of `{id, text}`; output is an array of `{id, text}`.
  - Batches are capped at about 60 items or 8,000 source characters, whichever comes first, with up to 3 batches in flight.
  - The system prompt asks for formal Modern Standard Arabic. It keeps codes, amounts, names of people and RACI letters unchanged, and returns only translations.
- **Validation**: an item is dropped (left untranslated) if its id is unknown, its text is empty, or its text is more than 4× the source length plus 200 characters. An answer identical to the source is kept and saved. That is how names and terms of art stay as written, and saving it stops them being sent again on every export.
- **Failure handling**: a failed batch leaves its items untranslated, while the other batches still save. The outcome reports the untranslated count and the first failure message, which feeds FR-008.

## 4. What is not sent

The following are kept as they are:
- empty strings
- text that already contains Arabic letters
- text with no Latin letters (numbers, amounts, symbols)
- process-code-like tokens (`/^[A-Z]{2,}\d+$/`)
- people's names (the walker does not visit them)
- the company and firm names

## 5. Report language

- **Decision**: a `lang` query parameter on the report page, the deck route and the per-process export routes. The export picker sets it from a language choice, defaulting to the interface locale. The per-process export buttons fall back to the interface locale.
- **Rationale**: a consultant working in English can produce an Arabic report (spec US2) without changing their own interface.
- **Client components** (the report preview) read the report's dictionary through a nested `LocaleProvider` carrying the report language. Their existing `useMessages()` therefore returns report wording, independent of the interface cookie.

## 6. Right-to-left per format

- **Printed report**: `dir="rtl" lang="ar"` on the report root. Logical CSS classes already mirror (spec 031). Diagrams stay `dir="ltr"`.
- **PowerPoint**: `rtlMode: true`, `lang: "ar-SA"` and right alignment on Arabic text. Arial is used for Arabic runs because it ships with PowerPoint on every platform.
- **Spreadsheets**: `views: [{ rightToLeft: true }]`.
- **PDF**:
  - react-pdf 4.6 shapes Arabic and applies bidi with an embedded font that has Arabic glyphs. A test render of IBM Plex Sans Arabic (WOFF, OFL licence) was correct.
  - The base direction must be set with `direction: "rtl"` and `textAlign: "right"`. Without it, trailing punctuation and wrapped lines are placed as if left to right, as the same test showed.
  - Rows use `flexDirection: "row-reverse"`.
- **Dates**: `formatDate(…, "ar")` from spec 031.

## 7. Telling the consultant (FR-008)

- **Decision**:
  - The export picker shows, for Arabic, how many of the pack's entries are already translated. It offers **Translate now**, which runs the translation and reports any left untranslated, with the reason.
  - The report preview shows the same notice (hidden in print) when it had to fall back.
  - Downloads translate on demand too and fall back silently, so the picker and preview are where the consultant finds out.
- **Rationale**: download responses are files, with nowhere visible to put a message. Moving the slow first translation into an explicit step also keeps downloads fast.

## 8. Concurrency

Rows are saved with `createMany({ skipDuplicates: true })` on the unique key. Two simultaneous exports may both ask the AI for the same text, but only one row is kept, and both read the kept row back. Corrections are updates by id, scoped to the workspace.
