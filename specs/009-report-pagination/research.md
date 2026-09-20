# Phase 0 Research: A Report That Paginates Like a Document

**Feature**: `specs/009-report-pagination` | **Date**: 2026-09-20

Every decision below is backed by a measurement taken from the real report, not
from reading the stylesheet. That distinction matters here: this problem has
been "fixed" several times from the stylesheet.

---

## R0. The page box, established first

Everything else is measured against this number, so it is pinned down before
anything is decided.

| | |
|---|---|
| Sheet | A4 landscape, 297 × 210 mm |
| Margin | 14 mm, from `@page` |
| **Printable height** | 210 − 28 = **182 mm = 688 px** at 96 dpi |
| Printable width | 297 − 28 = 269 mm = 1017 px |

Confirmed against the running report: the cover section measures **exactly
688 px** tall, and it is the one section already written to fill a page
(`min-h-[182mm]`). So 688 px is the page, and the constant is already in the
codebase rather than being introduced by this work.

---

## R1. What is actually causing the half-empty pages

**Finding**: `.print-page { break-after: page }` on every section.

**Measured**: the report exports to **13 pages, mean height usage ≈ 47%**. Six
pages are under a third used; one is at 6%.

**The experiment**: changing that one declaration to `break-after: auto` and
letting sections flow, with nothing else touched:

| | Today | Sections flowing |
|---|---|---|
| Pages | 13 | **11** |
| Mean usage | 47% | **57.3%** |
| Pages under 40% | 6 | 4 |

So flowing is the right model and it is most of the answer. It is not all of
it — four pages are still poorly used, and R2 explains why.

**Decision**: sections flow. Only the cover and the first page of each process
document keep a forced break, because those divisions tell a reader where they
are (FR-002).

**Alternatives considered**: keeping the paging model and tuning which sections
break. That is what has been tried repeatedly; it cannot work, because a short
section taking a whole page is the model behaving correctly.

---

## R2. Why four pages are still badly used after flowing

**Finding**: `break-inside: avoid` is applied to whole sections, and **a browser
cannot honour it on an element taller than the page**. The declaration is then
ignored and the element fragments wherever it lands.

**Measured** section heights against the 688 px page:

| Section | Height | Pages |
|---|---|---|
| Cover | 688 px | 1.00 |
| Org Structure | 348 px | 0.51 |
| Helicopter View | 428 px | 0.62 |
| Value Chain | 68 px | 0.10 |
| Processes in This Report | 180 px | 0.26 |
| **Purchase-to-Pay (process document)** | **2902 px** | **4.22** |
| Vendor Onboarding | 641 px | 0.93 |
| Closing | 136 px | 0.20 |

A process document is **four times a page**. Asking it not to break internally
is asking for the impossible, so the browser breaks it anywhere — including
through a step card, which is the "distorted section" in the report.

**Decision**: the unit that may not be broken is the **block**, not the
section. A process document must flow; the cards, rows and list items inside it
must not split. Anything asked to stay whole must be able to fit a page.

**Alternatives considered**: a hand-rolled paginator that measures every block
and lays them into explicit page boxes. Rejected under Constitution Principle VI
— CSS fragmentation is the platform-native mechanism and does exactly this job
correctly once it is asked the possible rather than the impossible. The
paginator would also have to re-implement the algorithm the browser already has.

---

## R3. The sliced diagram, and its root cause

**Finding**: `MAX_DIAGRAM_HEIGHT = 1500` in the report's process map.

A printable page is 688 px. A diagram is allowed to be **2.2 times that**, so a
long process map is *guaranteed* to fragment — which is exactly the screenshot
showing step cards severed horizontally and a lane band resuming on the next
sheet with no heading.

This is the root cause of the reported "distorted section between pages", and it
is a single number. Every previous attempt tuned break rules around it, which
could never have worked: no break rule can keep a 1500 px object inside a 688 px
page.

**Decision**: cap the diagram at the printable page height. The map already
knows how to wrap onto rows and to scale itself to its box, so a shorter box
produces a complete, smaller drawing rather than a cropped one — completeness is
never traded for legibility, which is the rule that file already states.

**Alternatives considered**: letting a tall diagram deliberately span two pages
with a "continued" heading. Rejected: the map is a single picture whose value is
seeing the flow at once, and it can already fold to fit.

---

## R4. Keeping the preview honest — the hard part

**Finding**: the preview draws its "Page break" marker from
`.print-page:not(:last-child)::after` — **the same class that forces the
break**. Preview and PDF therefore agree today only because both break after
every section. The moment sections flow, that agreement disappears: CSS
fragmentation decides breaks at paint time and exposes nothing to the DOM about
where they fell.

This is why the spec makes preview/PDF agreement a requirement in its own right
(FR-013, FR-014). It is also, most likely, why the problem went unnoticed long
enough to be reported as long-standing.

**Decision**: compute the break positions with a **pure function that packs
measured block heights into 688 px pages**, and draw the preview's markers from
it. The packing rule is the same one the browser applies — place each atomic
block in turn; if it does not fit the room left, start a new page — so the two
agree by construction rather than by coincidence.

The function is pure (heights in, break offsets out), so it is unit-testable
without a browser, and an end-to-end test can assert its answers against the
**real page boundaries of a generated PDF**. That is what makes SC-006
verifiable at all.

**Alternatives considered**:

- **Drop the marker.** Honest, but fails FR-014 and removes the check a
  consultant uses before sending a report to a client.
- **Mark every 182 mm down the sheet.** Ignores the jumps that `break-inside:
  avoid` causes, so the marker would be wrong precisely where pagination is
  interesting — a marker that lies is worse than none.

---

## R5. Where a table continues

**Finding**: the report's tables are real `<table>` elements with `<thead>`.

**Decision**: nothing to build. A browser repeats `<thead>` on every fragment of
a table automatically, which satisfies FR-008. The existing `tr { break-inside:
avoid }` keeps a row whole.

This was worth checking rather than assuming, because it removes a requirement
from the build.

---

## R6. Telling a reader what they are still reading

**Finding**: FR-010 needs a continuation to identify itself. For tables, R5
handles it. For everything else there is no CSS mechanism in Chrome —
`position: running()` and named page margins are not supported.

**Decision**: the blocks that can legitimately span a page are the step
narrative and the long tables. Tables identify themselves by their repeated
headings. The step narrative is a list of independently titled entries, each
kept whole, so a reader landing mid-list sees a step title immediately.

No new mechanism is built. The requirement is met by keeping the atomic unit
small enough that every fragment begins with something that names itself.

**Alternatives considered**: JavaScript-injected continuation headers. Rejected
— it would need the same paint-time break knowledge the browser does not expose,
and R4's packing function only knows where breaks fall, not how to inject
content there without changing the heights it just measured.

---

## R7. The closing message

**Finding**: `ClosingPage` carries `print-page` (so forces a break) *and*
`mt-10 break-inside-avoid`. At 136 px it is a fifth of a page.

**Decision**: it becomes an ordinary flowing block that stays whole. It then
shares the last page whenever there is room, and takes its own page only when
there is not (FR-011, FR-012) — which is the spec's requirement exactly.

---

## R8. One statement, not scattered declarations

**Finding**: the print rules are spread across `.print-page`, `h1..h4`, `tr`,
`.print-stack`, and a `break-inside-avoid` class repeated on roughly a dozen
elements in the JSX.

That scattering is why the problem kept returning: a new section inherits
nothing, so each one had to be fixed individually and the next reintroduced it.

**Decision**: one named class expressing "this is an atomic block — do not break
inside it", applied by the section renderers, plus one stylesheet block that
states the page rule once. New sections then inherit correct pagination instead
of needing their own fix (FR-018).
