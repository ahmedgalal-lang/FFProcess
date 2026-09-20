# Contract: The Page Rule

**Feature**: `specs/009-report-pagination`

Two contracts. The first is what the document promises a reader; the second is
the function the preview and the tests both call.

---

## 1. The printed document

What any exported report guarantees, whatever sections are on and in whatever
order.

| Promise | Requirement |
|---|---|
| The cover has a page to itself | FR-002 |
| Each process document begins a page | FR-002 |
| Nothing else begins a page unless the previous one ran out of room | FR-001 |
| No page break falls inside a step card, table row, list item or diagram | FR-006 |
| A section too big for the room left moves whole to the next page | FR-003 |
| A table continuing onto a page repeats its column headings | FR-008 |
| A heading is never the last thing on a page | FR-009 |
| No diagram is taller than one page | FR-007 |
| The closing message shares the last page when there is room | FR-011 |
| Content is never lost, reordered or duplicated | FR-017 |

### Stated once

One class marks a block as atomic — *do not break inside this*. One stylesheet
block states the page rule. A section renderer marks its blocks and inherits
everything else; nothing is declared per-element in the JSX.

That is the whole of FR-018, and it is the reason this is expected to stop
recurring: a section added next year inherits correct pagination rather than
arriving with none.

---

## 2. The packing function

```ts
// lib/domain/report-pagination.ts
export const PRINT_PAGE_HEIGHT_PX: number;   // 688

export function paginate(
  blocks: AtomicBlock[],
  options?: { forcedBreakBefore?: string[] }
): Pagination;
```

Pure: measured heights in, break positions out. No DOM, no framework, no
Prisma. Every rule in `data-model.md` Part 4 lives here and nowhere else.

| Input | Meaning |
|---|---|
| `blocks` | Every atomic block in document order, with its measured height |
| `forcedBreakBefore` | Ids that must begin a page — the cover and each process document |

| Output | Meaning |
|---|---|
| `breaks` | Where each page ends, in document order |
| `pageCount` | How many pages the document takes |
| `usage` | Fraction of each page carrying content |
| `oversized` | Blocks no rule can keep whole — empty for a correct report |

### Guarantees

- **Total.** Never throws. A block of zero, negative, `NaN` or infinite height
  is clamped rather than producing an infinite loop — the same hazard the
  wrapped process map hit, where a capacity of zero hung the renderer instead of
  failing it.
- **Deterministic.** The same heights always give the same breaks, so the
  preview and a test agree.
- **Faithful.** Its answers match where a browser actually breaks. That is not
  a claim to be trusted: an end-to-end test compares its output against the real
  page boundaries of a generated PDF.

---

## 3. What the preview draws

The preview's "Page break" marker is positioned from `paginate()` rather than
from the class that forces a break — which is the change that lets preview and
PDF keep agreeing once sections flow.

| Situation | What the preview shows |
|---|---|
| A break at offset N | A marker at offset N |
| A forced break (cover, process document) | A marker, same as any other |
| An oversized block | A marker where the page ends inside it, so the preview does not hide a fragmentation the PDF will show |

The preview keeps rendering at the printed page's real width and margin, so text
wraps identically in both (FR-015). That was already true and must stay true —
it is what makes a measured height mean the same thing on screen and on paper.
