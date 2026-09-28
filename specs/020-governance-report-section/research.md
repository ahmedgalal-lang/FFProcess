# Research: Governance & Risk in the Exported Report

## Decision 1 — A new *pack* section, positioned before the process body

The report catalogue (`lib/domain/report-arrangement.ts`) has two kinds of
section: `pack` (printed once — Cover, Org Structure, Helicopter View, Value
Chain, Processes in This Report, Closing) and `process` (repeated per
process — Executive Summary, Map, RACI, and the existing per-process
"Governance, Controls & Metrics", which is Key Control Points + KPIs derived
from the Authority Matrix). Risks, policies and assessment summaries are
workspace-wide, so the new section is a `pack` section, id `governance`,
title "Governance & Risk", placed after `chain` and before `index`. `index`
expands into the process index *and every process section*
(`export-preview.tsx`), so this puts the engagement-wide governance overview
ahead of the per-process detail — where a board pack's risk summary sits.

## Decision 2 — Missing pack entries insert at their catalogue position, not at the end

`resolveArrangement`'s `orderBy` appends any catalogue entry a stored
arrangement doesn't mention to the **end**, included. That is correct for
process sections and blocks (and `tests/unit/report-arrangement.test.ts`
pins it), but wrong for pack sections: every workspace arranged before this
ships would print "Governance & Risk" *after the Closing page*. Pack entries
get their own ordering rule: a missing entry is inserted directly after the
nearest entry that precedes it in the catalogue and is present in the
output (or first, if none precedes it). Process sections and blocks keep
the existing append rule unchanged.

## Decision 3 — One pure view-model builder, shared by both renderers

`loadReportData` (shared by the printed report and the PPTX route) gains a
`governance` field built by a new pure function in
`lib/domain/governance-report.ts` from raw rows: risks with their derived
level (`deriveRiskLevel`, the same banding the Risk Register already uses),
ordered open-before-closed then High → Low; policies with lifecycle status
and effective date; and per-aspect summaries, skipping aspects with no
summary (an assessment shell created by a hand-added checklist item has
`summary: ""`). Pure so it's unit-tested without a database, and shared so
the two export formats can't disagree (SC-004).

## Decision 4 — Specific empty messages, not the generic "No data yet"

The composer's snapshot test (`tests/e2e/report-composer.spec.ts`) captures
the default report's outline, including every line starting "No data yet".
If this section used the generic `NothingRecorded` marker, the snapshot
would depend on whether other specs had left risks or policies on the demo
workspace — exactly the order-dependence that file's comments warn about.
Each sub-part says what's missing specifically ("No risks have been
recorded on the Risk Register yet."), which also reads better to a client.
The snapshot gains exactly one line (the section title) — an intended change.

## Decision 5 — The deck skips the section when all three parts are empty

`report-pptx.ts` already skips empty sections rather than printing them
marked ("a slide that says no data yet is noise"). Same rule here: no
slides when there are no risks, no policies, and no summaries; otherwise
one slide per non-empty part, tables using `autoPage` like the existing
KPI and RACI tables.

## Decision 6 — What's excluded

Full policy bodies (FR-009), the phased checklist, and anything from the
ethics case register (spec 022, Admin-only by design) are not part of this
section. Report access stays VIEWER-level, unchanged.
