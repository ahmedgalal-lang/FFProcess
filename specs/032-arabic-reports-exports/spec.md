# Feature Specification: Arabic Reports and Exports

**Feature Branch**: `032-arabic-reports-exports`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "the arabic translation is only on the app aspects, not entries". Clarified with the user: entries are shown as an AI translation that is made once, saved beside the original and correctable by hand; the scope is reports and exports. This extends stage 3 of spec 031 (Arabic interface).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An Arabic report, entries included (Priority: P1) 🎯 MVP

A consultant hands an Arabic-speaking client the engagement report. Today, picking Arabic gives Arabic headings around English content: process names, steps, roles, risks, policies and assessment summaries all stay as typed. The client needs the whole report in Arabic.

**Why this priority**: The report is the main deliverable a client reads. A half-English report is not usable for an Arabic-speaking board.

**Independent Test**: On the export picker, choose Arabic and open the report. Every heading, label and column name is in Arabic and the layout is right to left. Every entry (process names and descriptions, steps, roles, RACI activities, authority rules, risks, policies, assessment summaries) is shown in Arabic. Process codes, people's names and amounts are unchanged. Diagrams keep their left-to-right flow with Arabic labels.

**Acceptance Scenarios**:

1. **Given** a workspace whose entries were typed in English, **When** the consultant exports the report in Arabic, **Then** each entry appears in Arabic, translated once and saved, and the in-app screens still show the entries exactly as typed.
2. **Given** an Arabic report already produced, **When** it is produced again with no entries changed, **Then** no entry is translated again and the wording is identical.
3. **Given** an entry edited after its translation was saved, **When** the report is next produced in Arabic, **Then** that entry, and only that entry, is translated afresh.
4. **Given** an entry already typed in Arabic, **When** the report is produced in Arabic, **Then** it is kept as typed.
5. **Given** the AI is not available (not configured, or the request fails), **When** the report is produced in Arabic, **Then** it is still produced with Arabic headings and labels, untranslated entries appear as typed, and the consultant is told which entries could not be translated and why.

---

### User Story 2 - Choosing the report language (Priority: P1)

A consultant who works in English needs to produce an Arabic report for one client and an English one for another, without switching their own interface language.

**Independent Test**: With the interface in English, choose Arabic on the export picker and export. The output is in Arabic, and the interface is still in English afterwards.

**Acceptance Scenarios**:

1. **Given** the export picker, **When** it opens, **Then** the report language defaults to the interface language and can be changed to English or Arabic.
2. **Given** a language chosen, **When** the consultant previews, prints, or downloads the PowerPoint, **Then** all of them use that language.

---

### User Story 3 - Arabic PowerPoint, spreadsheets and PDFs (Priority: P2)

Clients also receive the PowerPoint pack, the RACI and authority spreadsheets, and the per-process PDFs (RACI, authority, process map, org chart). These must match the Arabic report.

**Independent Test**: Export each format in Arabic. The PowerPoint text runs right to left with Arabic entries. Spreadsheets open as right-to-left sheets with Arabic column headings and entries. PDFs show Arabic headings and entries in a font that renders Arabic.

**Acceptance Scenarios**:

1. **Given** Arabic, **When** the PowerPoint is downloaded, **Then** its slides use the same Arabic wording as the report, and the text reads right to left.
2. **Given** Arabic, **When** a RACI or authority spreadsheet is downloaded, **Then** the sheet is right to left, headings are Arabic, and entries use the saved translations. RACI codes (R, A, C, I) stay as they are.
3. **Given** Arabic, **When** a per-process PDF is downloaded, **Then** its headings and entries are Arabic and display correctly, with diagrams laid out left to right.

---

### User Story 4 - Correcting a translation (Priority: P2)

The AI will sometimes choose the wrong term, for example a client's own name for a department. The consultant must be able to fix it once and have every later export use the fix.

**Independent Test**: Open the workspace's translations from the export picker, find an entry, change its Arabic wording, and save. Export again: the corrected wording appears wherever that entry appears.

**Acceptance Scenarios**:

1. **Given** saved translations, **When** an editor opens the translation list, **Then** each original entry is listed beside its Arabic wording, marked as from the AI or corrected by hand, and the list can be searched.
2. **Given** a corrected translation, **When** reports are produced later, **Then** the correction is used and is never replaced by a new AI translation while the original entry is unchanged.
3. **Given** an entry whose original text changes after a correction, **When** the report is next produced, **Then** the new text is translated afresh, because the correction belonged to the old wording.
4. **Given** a viewer (read-only access), **When** they open the translation list, **Then** they can read it but not change it.

---

### Edge Cases

- A very large workspace (hundreds of steps and long policy texts): translation is sent in batches. A failed batch leaves its entries as typed, without blocking the rest of the export, and a later export retries only those entries.
- The same text in several places (for example a role name used across processes) is translated once and reused everywhere.
- Empty entries are not sent for translation.
- Entries that are only codes, numbers or amounts (for example "PUR100" or "50,000") are kept as they are.
- Two consultants export in Arabic at the same time: both get a complete report, and the same entry is not saved twice.
- Long Arabic text in fixed-size spaces (PowerPoint boxes, diagram shapes) wraps or shrinks the same way English text does today.
- The AI's output must be translated text only. If what comes back is not a usable translation (empty, or wildly longer than the original), the entry is kept as typed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The export picker MUST offer a report language (English or Arabic), defaulting to the interface language. The choice applies to the preview, the print and PDF, and the PowerPoint.
- **FR-002**: In Arabic, all fixed wording in the report and in every export MUST be Arabic: headings, section titles, labels, column names, legends, lifecycle and status names, and notes.
- **FR-003**: In Arabic, the report and the exports MUST read right to left. Diagrams MUST keep their left-to-right layout, with Arabic text inside them.
- **FR-004**: In Arabic, every entry shown in the report and the exports MUST be shown in Arabic, using the workspace's saved translation for that exact text. Entries are any text a consultant or the AI wrote: names, descriptions, steps, roles, activities, rules, risks, policies, summaries, findings and KPIs.
- **FR-005**: An entry with no saved translation MUST be translated by the AI when an Arabic export needs it, and the translation MUST be saved so it is reused afterwards.
- **FR-006**: A translation MUST be tied to the exact original text. If the original changes, the next Arabic export MUST translate the new text. If it does not change, it MUST NOT be translated again.
- **FR-007**: Process codes, people's names, email addresses, amounts and RACI letters MUST stay as written. Entries already in Arabic MUST be kept as typed.
- **FR-008**: If the AI is unavailable, or translation of some entries fails, the export MUST still complete with those entries as typed, and MUST tell the consultant how many entries were left untranslated and why.
- **FR-009**: Editors MUST be able to view, search and correct a workspace's saved translations. A correction MUST be used in every later export for that original text, and MUST NOT be overwritten by the AI. Viewers may read the list but not change it.
- **FR-010**: Translations MUST belong to one workspace and MUST NOT be visible to, or reused by, any other workspace.
- **FR-011**: The in-app screens MUST continue to show entries exactly as typed. Translations are used only in reports and exports.
- **FR-012**: Dates in Arabic exports MUST use Arabic month names with Western digits, as in the Arabic interface.
- **FR-013**: The English report and exports MUST be unchanged by this feature.

### Key Entities

- **Saved translation**: The Arabic wording for one exact piece of original text in one workspace. It records where the wording came from (the AI, or corrected by hand), who corrected it, and when. One original text has at most one saved translation per workspace.
- **Report language**: The language an export is produced in, chosen on the export picker.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In an Arabic report for the demo workspace, with the AI available, 100% of headings and labels and at least 99% of entries are in Arabic. The only exceptions are codes, names and amounts kept by design.
- **SC-002**: Producing the same Arabic report a second time, with nothing changed, makes no new translation requests and finishes as quickly as the English report, within 10%.
- **SC-003**: After one entry is edited, the next Arabic export translates exactly one entry.
- **SC-004**: A consultant can correct a translation in under 30 seconds from the export picker, and the correction appears in the next export.
- **SC-005**: With the AI unavailable, an Arabic export still completes, and the consultant sees a notice naming how many entries are untranslated.
- **SC-006**: The Arabic report passes the same automated accessibility checks as the English one.

## Assumptions

- "Entries" covers the content of the report and the listed exports only. The in-app screens are out of scope, as the user chose.
- The AI used is the product's existing AI integration. Translation is a professional, formal Modern Standard Arabic rendering. Consultants are expected to review it, which is why corrections are supported.
- The first Arabic export of a large workspace may take noticeably longer while entries are translated. Later exports reuse the saved translations.
- Correcting translations needs the same editor access as editing the workspace's content. Reading them needs only viewer access.
- Activity-log history and languages other than Arabic are out of scope.
- The built-in wording already translated for the Arabic interface (spec 031), such as aspect names, lifecycle states and policy templates, is reused rather than sent to the AI.
