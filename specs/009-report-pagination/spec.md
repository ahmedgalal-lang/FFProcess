# Feature Specification: A Report That Paginates Like a Document

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "exported pdf file part is very messy, empty spaces, distorted section between pages, thank you on a separate stand alone page ... fix this issue once and for all, we have been trying to fix this for a very long time"

## Context

The Export Report is the deliverable. A consultant prints it and hands it to a
client, so its pagination is not a detail of the product — on paper it *is* the
product.

It currently paginates badly, and it has been patched repeatedly without the
problem going away. That history is itself evidence: the rule in force is "every
section starts a new page", and the complaints are all consequences of that rule
rather than defects in it. Tuning where the breaks fall cannot fix a model that
breaks in the wrong places by design.

### Measured, not impressions

A two-process report prints to **13 A4-landscape pages**. Measuring how much of
each sheet's height carries any ink at all:

| Page | Height used | | Page | Height used |
|---|---|---|---|---|
| 1 | 86% | | 8 | **12%** |
| 2 | 31% | | 9 | 68% |
| 3 | 46% | | 10 | 84% |
| 4 | **6%** | | 11 | 25% |
| 5 | 21% | | 12 | 79% |
| 6 | 75% | | 13 | **17%** (closing) |
| 7 | 71% | | | |

Six of thirteen pages are under a third used. The mean is about **47%** —
roughly half the paper is blank.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A report that does not waste half its paper (Priority: P1)

A consultant exports a report and finds each page carrying as much as fits,
rather than one short section per sheet.

**Why this priority**: This is the complaint, and it is what a client sees first.
A document that is half blank reads as unfinished whatever is written on it.

**Independent Test**: Export a report and measure the used height of every page.

**Acceptance Scenarios**:

1. **Given** a report with several short sections, **When** it is exported,
   **Then** consecutive short sections share a page instead of taking one each.
2. **Given** the same report, **When** page usage is measured, **Then** no page
   except a deliberate one is left mostly blank.
3. **Given** a section that would not fit in the room left on a page, **When**
   it is exported, **Then** it moves to the next page rather than being split at
   an arbitrary point.
4. **Given** any report, **When** it is exported, **Then** it uses no more pages
   than the same content needs.

---

### User Story 2 - Nothing important is sliced in half (Priority: P1)

No section is cut through the middle by a page break. Where something genuinely
must continue onto the next page, it says so, and it resumes under a heading
rather than in mid-air.

**Why this priority**: Equal to User Story 1. A half-empty page is ugly; a
diagram cut through the middle of its cards is unreadable, and the reader cannot
tell the two halves are one picture.

**Independent Test**: Export a report containing a process map taller than a page
and confirm no card, row or lane is severed by a page boundary.

**Acceptance Scenarios**:

1. **Given** a process map diagram, **When** the report is exported, **Then** the
   diagram is never cut through a step card.
2. **Given** a diagram too tall for one page, **When** it is exported, **Then**
   it is fitted to the page rather than fragmented across two.
3. **Given** a table that runs past the bottom of a page, **When** it continues,
   **Then** it resumes with its column headings repeated.
4. **Given** any section that continues onto another page, **When** the reader
   turns the page, **Then** something on the new page identifies what they are
   still reading.
5. **Given** any export, **When** it is read, **Then** no heading is left alone
   at the foot of a page with its content overleaf.

---

### User Story 3 - The closing page is not stranded (Priority: P2)

The closing "Thank you" sits at the end of the document rather than alone on a
sheet of its own.

**Why this priority**: Narrower than the first two, but it is the single thing
the consultant named, and it is the last page a client sees.

**Independent Test**: Export a report and confirm the closing message shares a
page where there is room for it.

**Acceptance Scenarios**:

1. **Given** a report whose last section leaves room, **When** it is exported,
   **Then** the closing message follows on that page.
2. **Given** a report whose last section fills its page, **When** it is
   exported, **Then** the closing message starts a new page and that is
   accepted.
3. **Given** the closing message on a page of its own, **When** that happens,
   **Then** it is because nothing could share the page, not by default.

---

### User Story 4 - The preview still tells the truth (Priority: P1)

What the preview shows on screen is what the PDF prints, including where the
pages break.

**Why this priority**: The preview is how a consultant checks a report before
sending it. A preview that disagrees with the PDF is worse than no preview,
because it is trusted. This is also how the problem went unnoticed for so long.

**Independent Test**: Compare the preview's page-break markers against the
exported PDF's real page boundaries.

**Acceptance Scenarios**:

1. **Given** a report, **When** it is previewed and then exported, **Then** the
   page breaks fall in the same places in both.
2. **Given** the preview, **When** a page break is shown, **Then** the PDF breaks
   there too.
3. **Given** the preview, **When** the PDF breaks somewhere, **Then** the preview
   showed a marker there.
4. **Given** any change to pagination, **When** it is made, **Then** preview and
   PDF still agree.

---

### Edge Cases

- **A section taller than a whole page.** The process map is the known case.
  Anything that cannot fit a page must be fitted to one or continued
  deliberately, never fragmented where it happens to land.
- **A section of one line.** Must not claim a page.
- **A report of one process with most sections switched off.** Must not produce
  a stack of nearly empty pages.
- **Every section switched on for several processes.** Must stay readable and
  must not lose content.
- **A section that is empty.** Already prints a "nothing recorded" line; it must
  not take a page to say so.
- **A table whose rows run past a page boundary.** Must repeat its headings.
- **The closing message as the only thing left.** Allowed a page of its own only
  when nothing can share it.
- **A report with no processes selected at all.** Must still produce a coherent
  document.

## Requirements *(mandatory)*

### Functional Requirements

**Filling the page (User Story 1)**

- **FR-001**: Content MUST flow onto the page in progress until that page is
  full, rather than each section beginning a new one.
- **FR-002**: The system MUST continue to start a new page for the cover and for
  each process's own document, because those divisions carry meaning.
- **FR-003**: A section that does not fit the room remaining MUST move to the
  next page whole, rather than being split at an arbitrary point.
- **FR-004**: A report MUST NOT use more pages than its content requires.
- **FR-005**: No page other than a deliberately reserved one (the cover, and any
  page a process document begins on) may be left mostly empty.

**Keeping things whole (User Story 2)**

- **FR-006**: A page break MUST NOT fall inside a step card, a table row, a list
  item or a diagram.
- **FR-007**: A diagram too tall for one page MUST be fitted to the page it is
  on rather than fragmented across two.
- **FR-008**: A table continuing onto another page MUST repeat its column
  headings.
- **FR-009**: A heading MUST NOT be printed at the foot of a page whose content
  begins on the next.
- **FR-010**: Any section that continues onto another page MUST identify itself
  on the continuation, so a reader who turns the page knows what they are
  reading.

**The closing page (User Story 3)**

- **FR-011**: The closing message MUST share the last page of content where
  there is room for it.
- **FR-012**: The closing message MUST be allowed its own page only when it
  cannot fit the page before.

**Preview and PDF agreeing (User Story 4)**

- **FR-013**: The preview MUST break pages in the same places as the exported
  PDF.
- **FR-014**: Every page break shown in the preview MUST occur in the PDF, and
  every break in the PDF MUST be shown in the preview.
- **FR-015**: The preview MUST keep rendering at the printed page's real width
  and margins, so text wraps identically in both.

**Not breaking what works**

- **FR-016**: Pagination MUST hold for any selection of sections in any order,
  since both are chosen per client.
- **FR-017**: No content may be lost, reordered or duplicated by the change.
- **FR-018**: The rule that decides pagination MUST be stated in one place, so a
  future section inherits correct behaviour instead of needing its own fix.

### Key Entities

- **Page**: One printed sheet. Has a fixed printable height, and a measurable
  proportion of that height carrying content.
- **Section**: One part of the report — a pack section such as the Helicopter
  View, or a block within a process document. Varies from one line to a full
  table.
- **Page-break rule**: The single statement of what may break, what may not, and
  what starts a page. Today's version is "every section starts a page", which is
  the cause of the complaint.
- **Break marker**: What the preview draws where a page will end. True only if
  it matches the PDF.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across an exported report, the mean proportion of each page's
  height that carries content rises from about 47% to **at least 70%**,
  excluding pages that are short for a deliberate reason (see below).
- **SC-002**: **No page** uses less than **40%** of its height, excluding those
  same deliberate cases.

**Which pages are excluded, and why.** Measuring the real output showed the
first draft of these criteria named the wrong pages. Excluded are:

1. **The cover**, which is its own page by design.
2. **Any page that ends because the next thing starts a new one** — the page
   before a process document begins. FR-002 requires each process document to
   start a page, so the page before it stops wherever the previous process
   ended. Penalising that would contradict FR-002.
3. **The closing page, when the closing message genuinely does not fit the page
   before it.** FR-012 permits exactly this, so it cannot also be a failure.

The first draft excluded "the first page of each process document", which is
backwards: that page is *full*. The short one is the page before it.
- **SC-003**: The same content exports to **fewer pages** than it does today.
- **SC-004**: **Zero** page breaks fall inside a step card, table row, list item
  or diagram, in any report.
- **SC-005**: The closing message shares a page with preceding content whenever
  that page has room.
- **SC-006**: Every page break in the preview matches the PDF, and the reverse,
  for every report tested.
- **SC-007**: A reader who turns to any continuation page can tell which section
  they are reading without turning back.
- **SC-008**: The rules survive a section list and order chosen at random.

## Assumptions

- **Flowing, not paging, is the right model.** A report is a document, not a
  slide deck. The current rule treats every section as a slide, and all three
  complaints follow from that. Sections flow; only the cover and each process
  document start a page.
- **Fitting beats fragmenting for a diagram.** A drawing cut across a page
  boundary is unreadable, while one scaled to fit a page is merely smaller. The
  process map can already scale and wrap.
- **A page is "well used" above 70%.** Enough to prove the waste is gone,
  loose enough to leave normal document whitespace alone.
- **The cover and each process document keep their page breaks**, because those
  divisions tell a reader where they are. Everything else earns its break by
  running out of room.
- **The preview is the check.** Preview and PDF agreeing is a requirement in its
  own right, not a consequence — that agreement is what makes the rest testable
  at all.
- **One rule, stated once.** The problem recurred because the behaviour lived in
  scattered per-element declarations. A single statement is what stops the next
  section from reintroducing it.

## Out of Scope

- Changing what any section contains, or the wording within it.
- The report composer's arrangement UI, and which sections are on by default.
- The RACI and Authority PDF exports, which are rendered by a different path.
- Page numbers, running headers and footers, or a table of contents.
- Any new report section.
- Changing the page size or orientation.
