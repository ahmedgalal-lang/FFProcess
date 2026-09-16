# Data Model: Report Composer

## Schema change: one column

```prisma
model Workspace {
  // ...
  /// How this client's report pack is arranged — which sections and blocks
  /// are included, in what order, and which section each block sits under.
  /// Null until someone arranges it, which is what makes an un-arranged
  /// workspace render exactly as it does today.
  reportArrangement Json?
}
```

One migration, one column, no backfill. Null is a meaningful value, not a gap to fill.

### Stored shape

```jsonc
{
  "version": 1,
  "pack":     [{ "id": "cover",   "on": true }, { "id": "org", "on": false }, ...],
  "sections": [{ "id": "raci",    "on": true }, { "id": "exec", "on": true }, ...],
  "blocks":   [{ "id": "purpose", "on": true, "sec": "exec" }, ...]
}
```

Array order **is** the arrangement — there is no separate index field, because the whole
thing is read and written as one value and an index would be a second source of truth for
the same fact.

`version` exists so a future shape change can be recognised rather than guessed at. A
record with an unrecognised version is treated as absent, which falls back to the default
arrangement rather than failing an export.

## The catalogue: what exists

Not stored. A constant in `lib/domain/report-arrangement.ts`, and the only place that
knows a section or block exists.

```
SectionSpec { id, title, kind: "pack" | "process", locked?: true }
BlockSpec   { id, title, defaultSection, pinnedTo?: string }
```

Default order is the order of the catalogue arrays, which is the order the report prints
in today — so the default arrangement and today's report are the same thing by
construction rather than by matching two lists.

`locked: true` on the cover page: a document without a cover is not a pack.

`pinnedTo: "raciGrid"` on the authority rules: the two move as one unit (FR-005) because
the rules are a column of that table, not a table of their own.

## Read model: `ResolvedArrangement`

What every renderer consumes. Produced by merging the stored value with the catalogue.

```
ResolvedArrangement {
  pack:     ResolvedSection[]   // in print order
  sections: ResolvedSection[]   // in print order, each carrying its blocks
}

ResolvedSection {
  id, title, on, locked
  number    // "1.0" for an included process section; null for pack sections
  blocks: ResolvedBlock[]
}

ResolvedBlock {
  id, title, on, pinnedTo
  number    // "1.2"; null when the block or its section is excluded
}
```

### The merge, and why it is not a straight read

Three things happen, in order:

1. **Stored entries are taken in their stored order**, minus any id the catalogue no
   longer knows — a block removed from the product disappears without a migration.
2. **Catalogue entries the stored arrangement does not mention are appended, included.**
   This is FR-019: a section added to the product after a workspace was arranged must not
   be silently hidden from it.
3. **Pinned blocks are pulled back together.** A stored arrangement that somehow separates
   the RACI grid from the authority rules — hand-edited data, or an arrangement saved
   before the pin existed — is repaired on read rather than rendered as two tables.

### Numbering

Computed during the merge, never stored.

- A section's number is its 1-based position among the **included** process sections,
  printed `N.0`.
- A block's number is its section's `N`, then its 1-based position among the **included**
  blocks of that section, printed `N.M`.
- An excluded section or block has no number at all.

Because the position is taken among *included* entries only, excluding something closes
the gap — FR-011 — with no renumbering pass.

## Emptiness

Not stored, not part of the arrangement, and decided per process at render time.

Each block in the catalogue carries a predicate over one process's report data:

```
isEmpty(process) => boolean
```

A section is empty when every one of its included blocks is empty, or when it has no
included blocks at all.

This is the one piece of state that must **not** live in the arrangement: filling in a
client's KPIs has to make the "no data yet" mark disappear without anyone rearranging
anything.

## What does not change

- `Process.archivedAt` filtering, workspace scoping, and which processes a pack contains.
- The per-process RACI and Authority spreadsheet downloads, which are not part of the pack.
- Process order, which stays in the report's query string so a shared link stays as sent.
