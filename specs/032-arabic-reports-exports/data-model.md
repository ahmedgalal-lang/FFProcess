# Data Model: Arabic Reports and Exports

## ContentTranslation (new table `content_translations`)

| Field | Type | Notes |
|---|---|---|
| id | String (uuid) | |
| workspaceId | String | FK → Workspace, onDelete Cascade |
| locale | String | `"ar"` for now. A string, not an enum, so a later language needs no migration. |
| sourceHash | String | SHA-256 hex of the trimmed source text |
| sourceText | String (text) | Shown on the corrections page |
| text | String (text) | The translation |
| origin | enum `TranslationOrigin` | `AI` or `MANUAL` |
| editedById | String? | FK → User, onDelete SetNull. Who corrected it. |
| createdAt / updatedAt | DateTime | |

**Unique**: `(workspaceId, locale, sourceHash)`. One translation per text per workspace and language.

**Index**: `(workspaceId, locale, updatedAt)` for the corrections list.

### Rules

- A row is created by an Arabic export (origin AI) or by **Translate now**. It is never created for text that `isTranslatable` rejects.
- A `MANUAL` row is never overwritten by the AI, because the AI only fills keys with no row at all.
- **Reset to AI** deletes the row. The next export translates the text again.
- Rows for text no longer used by any entry are left in place. They are harmless, small, and become useful again if an edit is undone.
- Rows are deleted along with their workspace.

## Report language

Not stored. It is carried as the `lang` query parameter (`en` | `ar`) on the report, deck and per-process export URLs, and it defaults to the interface locale.
