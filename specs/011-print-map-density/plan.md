# Implementation Plan: Printed Process Map Without Lane Bands

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-print-map-density/spec.md`

## Summary

A wide process (many roles, not just many steps) prints badly: every role a process
uses gets a full-height lane band on every printed row, so a row of six steps across
five roles is drawn five lanes tall while never more than one card tall. Measured at 4
pages for a 25-step, six-role process, most of each page blank. The fix — chosen from a
four-option mockup — drops lane bands from the **printed report only**: a row becomes a
single band sized to its tallest card. `wrapProcessMap` gains a `bands` option
(`lib/domain/process-layout.ts`), defaulting to today's behaviour so the PPTX
slide-deck export (its only other caller) is untouched; the static report diagram is
the only caller that opts out. The interactive canvas does not call this function at
all, so it is unaffected by construction. Every printed card already carries its role
name beneath its label, so no information is lost and no new visual device is needed.

## Technical Context

**Language/Version**: TypeScript 5, strict mode

**Primary Dependencies**: `@xyflow/react` 12.11.2 (unchanged — no new node/edge types),
React 19.2, Next.js 16.3 App Router

**Storage**: N/A — no schema change, pure layout geometry

**Testing**: Vitest for `wrapProcessMap` (`tests/unit/process-layout.test.ts`),
Playwright for the drawn result and page count
(`tests/e2e/wrapped-process-map.spec.ts`, `tests/e2e/connector-routing.spec.ts`,
`tests/e2e/report-print.spec.ts`), using the six-role `wide-process` fixture already
built this session

**Target Platform**: Browser (report preview) and Chromium print-to-PDF (report export)

**Project Type**: Web application — Next.js App Router, framework-free domain logic in
`lib/domain/`

**Performance Goals**: N/A — this reduces work (fewer nodes drawn per row), does not add
any

**Constraints**: The interactive canvas's code path must not be touched at all. The
PPTX export must be byte-for-byte unaffected. Connector routing's no-crossing guarantee
must continue to hold under the new geometry.

**Scale/Scope**: One domain function gains one optional parameter; one render branch in
one component is conditioned on it. This is the smallest change that satisfies every
functional requirement in the spec — no new files beyond the fixture and tests already
scoped.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| I. Type-Safe Full-Stack | Pass. `bands?: boolean` is a plain optional field on an existing options type; no `any`, no new trust boundary. |
| II. Shared Domain Model | Pass. The layout decision stays in `lib/domain/process-layout.ts`, the single source both callers already share, rather than duplicating row-packing logic per caller. |
| III. Test-First for Business Rules | Not engaged as a mandatory gate — this is presentation geometry, not a governed business rule (RACI/authority/sequencing) — but tested first anyway, same posture as the connector-routing work: the mutation-checked unit tests in `quickstart.md` are written before the render branch that consumes them. |
| IV. Accessible, Data-Dense UI | Pass, and improves the bar this session already raised: a map that mostly fits the page it prints on is more usable than one that is 70% blank space a reader has to scroll or flip past. No new interactive element, so no new a11y surface. |
| V. Workspace Isolation & Least Privilege | Not engaged. No query, no server action, no authorization decision — pure rendering geometry over data already loaded. |
| VI. Simplicity & Incremental Delivery | Pass, explicitly: Decision 3 in `research.md` keeps `WrappedRow.lanes` computed in both modes rather than adding a second return shape, and Decision 4 confirms no compensating visual device is needed, because the spec never asked for one and the information was never actually lost. Both are the "smallest change" call recorded rather than left implicit. |

No violations. Complexity Tracking table omitted.

## Project Structure

### Documentation (this feature)

```text
specs/011-print-map-density/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0
├── data-model.md         # Phase 1
├── quickstart.md         # Phase 1
├── contracts/
│   └── wrap-process-map.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks output — not created here
```

### Source Code (repository root)

```text
lib/domain/
└── process-layout.ts                 # wrapProcessMap gains `bands` option

app/(app)/workspaces/[workspaceId]/processes/[processId]/map/
└── static-process-map-diagram.tsx    # passes bands: false; skips lane-node build when so

tests/
├── unit/process-layout.test.ts       # bands: false cases + default-preserves-today cases
├── fixtures/wide-process.ts          # already exists (built for the earlier mockup work)
└── e2e/
    ├── wrapped-process-map.spec.ts   # extended: no lane nodes when bands are dropped
    ├── connector-routing.spec.ts     # re-run print test under new geometry (SC-002)
    └── report-print.spec.ts          # page-count-dropped measurement (SC-001)
```

**Structure Decision**: No new files beyond tests. `lib/export/pptx/report-pptx.ts` is
listed in neither section above because it needs no change — it is the control case
that proves the default is safe, per `research.md` Decision 1 and 5.

## Phase 1 re-check

Re-evaluated after the contract and data model were written.

- Confirmed by grep before this plan existed that `wrapProcessMap` has exactly two
  callers, and that the interactive canvas is not one of them — this is what lets FR-006
  be satisfied by *not writing code* there, rather than by a test that merely checks
  nothing broke.
- Confirmed by reading `map-nodes.tsx`'s `CompactStepNode` that the role name is already
  printed on every card — this removed a step from the plan (no colour-flag device to
  build) that the mockup's own drawing would otherwise have implied was needed.

Constitution Check re-run against the final design: still no violations.
