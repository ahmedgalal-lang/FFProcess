# Implementation Plan: Build a Process from a Spreadsheet

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-process-import/spec.md`

## Summary

Let a consultant download a product-generated workbook, fill it in offline, upload it,
and have a whole process built from it in one transaction — steps in their lanes,
connected, with the RACI grid and the Authority Matrix populated.

The approach: a **pure parser** (`lib/domain/process-import.ts`) turns sheet rows into
a checked plan, reusing the product's own validators — `validateRaciMatrix`,
`validateAuthorityTable`, `validateConnections` — unmodified, by giving each parsed
entity a **provisional id encoding its sheet and row**. That one decision satisfies
both halves of the hard requirement at once: the rules are the product's, not a second
copy (FR-021), and every issue those validators return decodes straight back into
"sheet `RACI`, row 12" for the consultant (FR-017). A **template generator** and the
parser are built from one shared declaration of the sheets, so they cannot drift, and
the template's own worked example is the standing round-trip test (FR-006). One server
action with a `dryRun` flag previews, then writes inside a single transaction —
the shape `importValueChain` already established in this codebase.

No new dependency and no migration.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20, React 19.2

**Primary Dependencies**: Next.js 16.3 (App Router), Prisma 7.9 + `@prisma/adapter-pg`,
Zod 4, **ExcelJS 4.4 — already present**, used for writing (`lib/export/xlsx.ts`) and
reading (`readValueChainSheet`) alike

**Storage**: PostgreSQL via Prisma. **No migration** — this feature writes existing
tables only (see `data-model.md`, Part 2)

**Testing**: Vitest for the parser and the validator bridge (Constitution III),
Playwright for the upload flow, access and accessibility. Playwright cannot import the
Prisma client, so its fixtures use raw `pg`

**Target Platform**: Server-rendered web app, deployed at `ffprocess-rfhlth.cranl.net`

**Project Type**: Web application — Next.js App Router, server actions and route
handlers, no separate backend

**Performance Goals**: A 22-step process (SC-002) previews and imports well inside one
request. Bounded by a 300-step cap so the write stays one short transaction

**Constraints**: All-or-nothing (FR-019) — one `prisma.$transaction`, no partial write
under any failure. Nothing persisted before the consultant confirms (FR-015). Upload
capped at 4 MB, reusing the value-chain importer's `MAX_IMPORT_BYTES`

**Scale/Scope**: One process per file. 7 data sheets, ~9 persisted entity types
written, 3 existing validators reused, 2 new server entry points, 1 new pure domain
module

## Constitution Check

*GATE: passed before Phase 0. Re-checked after Phase 1 design — still passing.*

| Principle | How this feature complies |
|---|---|
| **I. Type-Safe Full-Stack** | The upload is a trust boundary and gets a Zod schema before anything else runs, as every other action in `lib/actions/` does. Parsed shapes are inferred, not hand-maintained twice. No `any` — the one `Buffer` cast ExcelJS needs is the existing commented interop shim in `readValueChainSheet`, copied with its comment. |
| **II. Shared Domain Model** | The centre of the feature. A role or person named in the file is **matched by name to the existing workspace entity**, never duplicated (FR-012) — the same case-insensitive `findByName` the value-chain importer uses. RACI attaches through `Activity` exactly as `setStepRaciCell` creates it (research R4), so an imported process is structurally identical to a hand-built one rather than a parallel representation. |
| **III. Test-First for Business Rules** | The parser and the provisional-id bridge decide "is this file importable" — squarely business-rule logic. Tests are written first and must fail first: `tests/unit/process-import.test.ts`, `-problems`, `-roundtrip`, `-transaction`. The parser is pure by construction, so none of them needs a database. |
| **IV. Accessible, Data-Dense UI** | The summary and the problem list are dense tabular UI and are held to the same bar: keyboard-reachable with visible focus, problems announced rather than signalled by colour, axe-clean. Checked before done, not after (scenario 6). |
| **V. Workspace Isolation & Least Privilege** | `requireWorkspaceAccess(workspaceId, "EDITOR")` on the action **and** on the download route — the download is gated at `EDITOR`, stricter than the existing `VIEWER` exports, because FR-024 makes it editor-only. Hiding the controls is presentation; the server check is the enforcement, and scenario 5 tests the server, not the button. |
| **VI. Simplicity & Incremental Delivery** | No new dependency: ExcelJS is already read from and written to. No importer framework, no plugin layer, no configuration — one pure module, one action, one route, following the `importValueChain` shape already in the codebase. Two deliberate deferrals are recorded in the spec's Out of Scope (updating an existing process from a file; importing several at once) rather than left implicit. |

**Violations**: none. Complexity Tracking below is therefore empty.

## Project Structure

### Documentation (this feature)

```text
specs/008-process-import/
├── plan.md                        # This file
├── spec.md                        # Feature specification
├── research.md                    # Phase 0 — 11 decisions, no open questions
├── data-model.md                  # Phase 1 — transient shapes, persisted writes, validation
├── quickstart.md                  # Phase 1 — 7 validation scenarios
├── contracts/
│   ├── workbook-template.md       # The sheet-by-sheet workbook contract
│   └── server-interfaces.md       # The download route and the import action
├── checklists/
│   └── requirements.md            # Spec quality checklist — all passing
└── tasks.md                       # Phase 2 — created by /speckit-tasks, not here
```

### Source Code (repository root)

```text
lib/
├── domain/
│   └── process-import.ts          # NEW — pure parser: rows in, checked plan out.
│                                  #   Shares its sheet declaration with the generator,
│                                  #   so the two cannot drift.
│   ├── raci-validation.ts         # reused unmodified (validateRaciMatrix)
│   ├── authority-table.ts         # reused unmodified (validateAuthorityTable)
│   ├── process-graph.ts           # reused unmodified (validateConnections)
│   ├── process-hierarchy.ts       # reused (generateProcessCode)
│   └── process-layout.ts          # reused (FIRST_STEP_X, STEP_X_SPACING, laneY)
├── export/
│   └── process-import-template.ts # NEW — generates the workbook from the shared
│                                  #   declaration, with the worked example
└── actions/
    └── process-import.ts          # NEW — importProcess(formData), dryRun + commit,
                                   #   EDITOR-gated, one transaction

app/
├── api/template/process-import/[workspaceId]/
│   └── route.ts                   # NEW — GET the template, EDITOR-gated
└── (app)/workspaces/[workspaceId]/processes/
    ├── page.tsx                   # EDITED — render the panel when canEdit
    └── import-panel.tsx           # NEW — upload, summary, problem list, confirm

tests/
├── unit/
│   ├── process-import.test.ts             # NEW — parsing a good file
│   ├── process-import-problems.test.ts    # NEW — every problem names its row
│   ├── process-import-roundtrip.test.ts   # NEW — the untouched template imports
│   └── process-import-transaction.test.ts # NEW — a mid-write failure leaves nothing
├── e2e/
│   ├── process-import.spec.ts             # NEW — upload, preview, confirm, decline
│   ├── process-import-access.spec.ts      # NEW — viewer sees nothing, is refused
│   └── process-import-a11y.spec.ts        # NEW — axe + keyboard
└── fixtures/
    └── process-import-sample.ts           # NEW — builds the 22-step fixture workbook
```

**Structure Decision**: the existing Next.js App Router layout, unchanged. Business
rules go in `lib/domain/` as a pure module (Principle III), workbook generation joins
the other generators in `lib/export/`, the write goes in `lib/actions/` beside
`value-chain.ts` whose import shape it follows, and the download joins the route
handlers under `app/api/`. Nothing new is introduced structurally — this feature is
placed entirely within conventions the codebase already has.

## Phase 0 — Research

Complete. See [research.md](./research.md). Eleven decisions, no `NEEDS CLARIFICATION`
remaining. The two that shaped everything else:

- **R3 — reusing the validators before anything has an id.** All three keep score by
  database id, but nothing may be written before the summary. Provisional ids of the
  form `Steps!7` let the validators run unmodified *and* let every issue they return
  point back at a row. This also corrected the feature description's guess: the RACI
  validator is `validateRaciMatrix`; `validateRaciTable` does not exist.
- **R2 — recognising the template.** The opposite of the value-chain importer's
  forgiving header sniffing: because the product generated this file, it may demand
  named sheets and a format version, which is the only way the "older release" edge
  case can be refused by name rather than half-understood.

## Phase 1 — Design

Complete.

- [data-model.md](./data-model.md) — the transient shapes, the nine persisted entity
  types the transaction writes, the structural and domain validation rules, and the
  one state transition, which only moves forward on an explicit human act.
- [contracts/workbook-template.md](./contracts/workbook-template.md) — the sheet and
  column contract a consultant fills in.
- [contracts/server-interfaces.md](./contracts/server-interfaces.md) — the download
  route, the import action, and the pure parser signature.
- [quickstart.md](./quickstart.md) — seven scenarios, mapped to the Success Criteria.

**Post-design Constitution re-check**: passing, unchanged. The design added no
abstraction beyond the one pure module, no dependency, and no table.

## Complexity Tracking

No Constitution violations. Nothing to justify.
