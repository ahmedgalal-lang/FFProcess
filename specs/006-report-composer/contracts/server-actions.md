# Contracts: server action and domain surface

## `saveReportArrangement`

Lives in `lib/actions/report-arrangement.ts`. Validates at the boundary (Principle I) and
checks access on the server (Principle V).

**Input**

```
{ workspaceId: string (min 1),
  arrangement: {
    pack:     { id: string, on: boolean }[],
    sections: { id: string, on: boolean }[],
    blocks:   { id: string, on: boolean, sec: string }[]
  } }
```

**Behaviour**

1. Parse. Invalid → `VALIDATION_ERROR`.
2. `requireWorkspaceAccess(workspaceId, "EDITOR")`. Insufficient → the access error.
3. Reject ids the catalogue does not know, and block `sec` values that are not process
   sections — a client that sends a section id from a different product version should get
   a validation error, not a silently corrupt arrangement.
4. Force `on: true` on locked sections. The cover page cannot be excluded however the
   request is shaped.
5. Write `{ version: 1, ...arrangement }` to the workspace.
6. Revalidate the export page and the report.

**Returns**: `ok({ workspaceId })`.

**Last save wins** (spec Assumptions). No optimistic-concurrency token, no conflict
detection: two editors arranging the same client at once is rare enough that the machinery
would cost more than it saves.

**Not validated**: whether the arrangement is "sensible". Every section excluded is a legal
arrangement — FR-025 says it produces a document that says it is empty.

---

## `resolveArrangement`

Pure, in `lib/domain/report-arrangement.ts`. No database, no React — which is what lets it
be unit-tested against the rules in `data-model.md`.

```
resolveArrangement(stored: unknown): ResolvedArrangement
```

- `null`, `undefined`, malformed, or an unrecognised `version` → the default arrangement.
  An export must never fail because of a bad stored value.
- Otherwise: stored order, minus unknown ids, plus unmentioned catalogue entries appended
  included, with pinned blocks pulled back together, and numbering computed.

**Total.** There is no input for which this throws, because every caller is on a render
path for a document someone is waiting for.

---

## `isSectionEmpty` / `isBlockEmpty`

Also pure, also in the domain module.

```
isBlockEmpty(blockId: string, process: ExportProcessData): boolean
isSectionEmpty(section: ResolvedSection, process: ExportProcessData): boolean
```

A section is empty when every **included** block in it is empty, or when it has no included
blocks. An excluded block does not make its section empty — it is not there to be empty.

---

## Unchanged

`loadReportData` keeps its signature. The arrangement is loaded alongside it rather than
threaded through it, so the deck and the report read the same two values independently and
neither becomes a parameter of the other.
