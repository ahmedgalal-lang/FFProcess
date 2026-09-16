# Research: Report Composer

Seven questions the spec left to implementation. Each was answered by reading the code
rather than by preference.

## 1. Where does the arrangement live?

**Decision**: one nullable JSON column on `Workspace`, `reportArrangement`.

**Rationale**: the arrangement is always read whole and written whole — nothing ever
queries "which workspaces include the KPI block". A relational table would mean fifteen
rows per workspace, a join on every report render, and ordering columns to maintain, in
exchange for query shapes nobody needs. JSON on the owning row is already the pattern here
(`Process.kpis`, `Process.externalEntities`), and nullable gives FR-016 for free: null
means "never arranged", which is exactly today's behaviour.

**Alternatives considered**:
- *A `ReportArrangement` table with a row per section and block.* Correct-looking and
  wrong-sized: Principle VI says do not generalise before two call sites need it, and
  there is one.
- *Keep it in the query string like process order.* Rejected by the user's decision — an
  arrangement that lives only in a link cannot be what a colleague sees when they open the
  workspace (FR-015).

## 2. How does a stored arrangement survive a new section being added?

**Decision**: a canonical catalogue in code is the source of truth for *what exists*; the
stored arrangement only says what is included and in what order. At read time the two are
merged, and anything in the catalogue the stored arrangement does not mention is appended
in its default position, included.

**Rationale**: FR-019 exists because the alternative fails silently. If the stored list
were authoritative, every workspace arranged before a new section shipped would hide that
section forever, and nobody would ever see an error telling them so. Merging means a new
section appears for everyone and a consultant removes it if they do not want it.

This also settles what happens to a block that is *removed* from the product: it is simply
absent from the catalogue, so it drops out of every arrangement without a migration.

## 3. What is a "block", concretely?

**Decision**: eleven blocks across four per-process sections, each one a named piece of
`export-preview.tsx`'s current output, plus six pack-level sections with no blocks.

| Section | Blocks |
| --- | --- |
| Executive Summary | Process Purpose · Trigger & Output · Internal Roles · External Entities |
| Process Map & Narrative | Scope · Workflow diagram · Step narrative |
| RACI & Authority Matrix | RACI grid · Authority rules *(pinned)* |
| Governance, Controls & Metrics | Key Control Points · Operational KPIs & SLAs |

Pack sections: Cover page · Org Structure · Helicopter View · Value Chain · Processes in
This Report · Closing page.

**Control points are a block, KPIs are a block, but "control points" as a concept is
derived** — `deriveControlPoints` computes them from the combined RACI and authority rows
at render time. Including the block means "print the derived list"; it does not require
anything to be stored.

**Cover page is not excludable.** A document with no cover is not a pack. It stays in the
catalogue so it can be reordered relative to nothing, but carries a locked flag.

## 4. How does a fixed-order renderer become an arranged one?

**Decision**: split `ProcessReportSection` so each block is its own component, keyed by
block id in one lookup table, and have the renderer walk the arrangement. Same for the six
pack-level sections.

**Rationale**: the file is 1,092 lines of JSX in a fixed sequence with `hasX &&` guards
around each part. Those guards are what FR-023 reverses — an empty section must now print
rather than vanish — so every one of them is being touched anyway. Turning each into a
component with an `isEmpty(process)` predicate replaces the guard with data the renderer
can act on, and is what makes "print it, marked empty" and "leave it out" two different
decisions instead of one.

**The riskiest part of this feature** is that restructuring a 1,092-line component can
change output no one asked to change. SC-007 is the guard: a workspace with no arrangement
must produce the same content it does today, and that is worth an explicit test rather
than an eyeball.

## 5. What happens to the "missing content" banner?

**Decision**: it changes meaning and wording. Today it says *"Some sections are missing
content and are left out of this report"* — after this feature they are no longer left
out, so the sentence becomes false.

It becomes a list of what is empty and still printed, pointing at where to fill it in. The
banner is preview-only (`no-print`), so this costs the exported document nothing.

**Rationale**: leaving it as-is would have the report contradict itself on the same screen
— a banner saying a section was left out, above that very section.

## 6. How does the deck follow the same arrangement?

**Decision**: the deck consumes the same merged arrangement and the same catalogue order,
mapping each included section to the slides it already builds, and skipping excluded ones.

**Rationale**: `report-pptx.ts` already walks the same `loadReportData` output in the same
fixed order, so the change is the same shape: replace the fixed sequence with a walk over
the arrangement. Blocks map to parts of a slide rather than to slides of their own, so a
block exclusion removes content from a slide rather than removing a slide.

**Not done**: per-block empty markers on slides. A deck is a summary; printing "no data
yet" on a slide is noise. Empty sections are skipped in the deck and the difference is
recorded in the plan rather than left for someone to discover.

## 7. Who may arrange, and what does a viewer see?

**Decision**: `requireWorkspaceAccess(workspaceId, "EDITOR")` in the save action;
`useCanEdit()` decides whether the controls render at all.

**Rationale**: this matches every other mutation here, and the established convention is
that a read-only user is shown none of it rather than controls the server will refuse. The
important half is the second one in FR-018: a viewer must still preview, export and read
the report. Hiding the arranging controls must not hide the export button beside them —
that is most of why a client is given an account at all, and the existing
`viewer-read-only` spec already asserts it.
