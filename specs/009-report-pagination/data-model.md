# Phase 1 Data Model: A Report That Paginates Like a Document

**Feature**: `specs/009-report-pagination` | **Date**: 2026-09-20

No database tables, no migration, no persisted state. Pagination is computed
while a report is being looked at and thrown away. What follows is the small set
of shapes that computation uses, and the rules that govern it.

---

## Part 1 — The one constant everything is measured against

| Name | Value | Where it comes from |
|---|---|---|
| `PRINT_PAGE_HEIGHT_PX` | **688** (182 mm at 96 dpi) | A4 landscape 210 mm less the `@page` 14 mm margins |
| `PAGE_CONTENT_WIDTH_PX` | 1017 (269 mm) | Already exists; unchanged by this work |

688 is the number the whole feature turns on: it is the height a block must fit
inside to be keepable whole, the height a diagram is capped to, and the height
the packing function fills. Stated once, imported everywhere.

---

## Part 2 — Transient shapes (new)

These live in a pure module: measured heights in, break positions out. No DOM,
no framework.

### `AtomicBlock`

One thing that must not be split by a page break.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Identifies it for a test's assertions |
| `height` | `number` | Its measured height in px |

A block taller than `PRINT_PAGE_HEIGHT_PX` is not an error — it is something the
page cannot hold, and the packer has to place it somewhere. See Part 4.

### `PageBreak`

Where one page ends.

| Field | Type | Notes |
|---|---|---|
| `offset` | `number` | Distance from the top of the document's content |
| `beforeBlockId` | `string \| null` | The block pushed onto the new page; `null` when the break falls inside an over-tall block |

### `Pagination`

| Field | Type | Notes |
|---|---|---|
| `breaks` | `PageBreak[]` | In document order |
| `pageCount` | `number` | `breaks.length + 1` |
| `usage` | `number[]` | Fraction of each page carrying content — what SC-001 and SC-002 are measured from |
| `oversized` | `string[]` | Ids of blocks taller than a page, which no rule can keep whole |

`oversized` is deliberately reported rather than silently tolerated: it is the
list of things that *will* fragment, and a test asserts it is empty for a real
report.

---

## Part 3 — What changes in the rendered document

Nothing about content. Only which elements start pages and which stay whole.

| Element | Today | After |
|---|---|---|
| Cover | starts a page | **unchanged** — starts a page |
| Each process document | starts a page | **unchanged** — starts a page |
| Org Structure, Helicopter View, Value Chain, Processes in This Report | each starts a page | flows; kept whole if it fits a page |
| Blocks within a process document | inherit the section's break | flow; each block kept whole |
| Closing message | starts a page | flows; kept whole |
| Step cards, table rows, list items | kept whole (scattered rules) | kept whole (one rule) |
| Table headings | repeated by the browser | **unchanged** |
| Process map diagram | up to 1500 px tall | **capped at 688 px** |

---

## Part 4 — The packing rule

Stated once, because scattering it is what made this recur.

```
room = PRINT_PAGE_HEIGHT_PX
for each block in document order:
    if block.height > PRINT_PAGE_HEIGHT_PX:
        # Nothing can keep it whole. It starts a fresh page and runs over.
        # Recorded in `oversized`; the fix belongs upstream, not here.
        emit a break before it unless the page is already empty
        room = PRINT_PAGE_HEIGHT_PX - (block.height mod PRINT_PAGE_HEIGHT_PX)
    else if block.height > room:
        emit a break before it
        room = PRINT_PAGE_HEIGHT_PX - block.height
    else:
        room = room - block.height
```

This is the rule a browser already applies to a sequence of
`break-inside: avoid` blocks. It is written down here so the preview can predict
the same answer, not so anything re-implements the browser.

### Rules that hold regardless

| Rule | Requirement |
|---|---|
| A break never falls inside a block | FR-006 |
| A block that does not fit the room left moves whole to the next page | FR-003 |
| The cover and each process document always begin a page | FR-002 |
| Nothing else begins a page unless it ran out of room | FR-001 |
| A heading is never the last thing on a page | FR-009 |
| A diagram is never taller than a page | FR-007 |

---

## Part 5 — What "a well-used page" means

The measurement the success criteria are written against, so a test and the spec
cannot disagree about it.

- A page's **usage** is the fraction of `PRINT_PAGE_HEIGHT_PX` between the first
  and last ink on that page.
- Two page kinds are **excluded**: the cover, and the first page of each process
  document. Both are deliberately reserved, so counting them would penalise the
  behaviour FR-002 requires.
- Across the remaining pages: mean usage **≥ 70%** (SC-001), and no single page
  below **40%** (SC-002).
