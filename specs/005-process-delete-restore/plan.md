# Implementation Plan: Delete Warning & Process Restore

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-process-delete-restore/spec.md`

## Summary

Deleting a process already leaves everything intact — it sets `Process.archivedAt` and
every query filters it out. This feature makes that reversibility visible and usable: a
page listing what a workspace has deleted with a Restore control, and a confirmation in
front of Delete that names the process, says what is attached to it, says what else points
at it, and says it can be undone.

No schema change, no migration. One new action to clear the timestamp, one read-only
action to describe the impact, one new page, one rewritten button.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 22

**Primary Dependencies**: Next.js 16 (App Router), React 19, Prisma 7 with
`@prisma/adapter-pg`, Zod, Tailwind v4, Auth.js

**Storage**: PostgreSQL. **No migration** — `Process.archivedAt` already exists.

**Testing**: Vitest for domain logic (`pnpm test`), Playwright for end-to-end
(`tests/e2e/`), `@axe-core/playwright` for the accessibility bar

**Target Platform**: Server-rendered web application

**Project Type**: Web application, single Next.js project

**Performance Goals**: The impact summary is five queries behind a dialog a consultant
opens deliberately; the Processes list query is not to grow.

**Constraints**: The deleted-processes page must stay readable at dozens of rows.
Confirmation must meet WCAG 2.1 AA and be keyboard-operable (Principle IV).

**Scale/Scope**: Two server actions, one page, one client component rewritten, one link.
Processes only — roles and people are out of scope.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | How this feature satisfies it |
| --- | --- |
| **I. Type-Safe Full-Stack** | Both actions take Zod-validated input at the boundary; the two read models are inferred types exported from one place, not re-declared per consumer. |
| **II. Shared Domain Model** | Nothing new is modeled. The feature reads existing relations to count them and flips one existing field. |
| **III. Test-First for Business Rules** | The rules worth testing are: what a restore must leave untouched, what the impact counts include, and who may restore. Each gets a failing test before the code — including one that proves the count excludes already-deleted sub-processes. |
| **IV. Accessible, Data-Dense UI** | The new dialog gets Escape, focus-on-open, visible focus rings and an axe check. The deleted list is a plain table with a real empty state. |
| **V. Workspace Isolation & Least Privilege** | Restore checks `EDITOR` server-side and confirms the process belongs to the addressed workspace. The page and every control render only for editors — a viewer sees neither. |
| **VI. Simplicity & Incremental Delivery** | No migration, no new abstraction, no purge or retention machinery. The impact summary is one action, not a generalized "entity impact" layer. |

**Post-Phase-1 re-check**: still passing. The one thing Phase 1 changed is the removal of a
control-point count from FR-014 — dropping a number that does not exist made the feature
smaller, which is the direction Principle VI asks for.

### Noted, not fixed here

The two existing dialogs in `process-forms.tsx` (Clone, Edit) handle neither Escape nor
focus-on-open. The new dialog does. Retrofitting the other two is a separate change and is
recorded here rather than folded in silently (Principle VI).

## Project Structure

### Documentation (this feature)

```text
specs/005-process-delete-restore/
├── plan.md              # This file
├── spec.md              # The specification
├── research.md          # Phase 0 — six decisions
├── data-model.md        # Phase 1 — no schema change, two read models
├── quickstart.md        # Phase 1 — how to prove it works
├── contracts/
│   └── server-actions.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — created by /speckit-tasks
```

### Source code

```text
lib/
├── actions/process.ts                  # + restoreProcess, + getProcessDeleteImpact
└── domain/process-delete-impact.ts     # NEW — what counts, and the "empty" rule

app/(app)/workspaces/[workspaceId]/processes/
├── page.tsx                            # + editor-only link to the deleted page
├── process-forms.tsx                   # ArchiveProcessButton rewritten as a dialog
└── deleted/
    ├── page.tsx                        # NEW — the list, editor-gated at page level
    └── restore-button.tsx              # NEW — client control calling restoreProcess

tests/
├── unit/process-delete-impact.test.ts  # NEW — the counting rules
└── e2e/
    ├── process-restore.spec.ts         # NEW — delete, verify gone, restore, verify back
    └── viewer-read-only.spec.ts        # extended — neither control, page refuses
```

**Structure Decision**: single Next.js App Router project, matching every feature before
this one. Server Components load data; the two interactive pieces (the confirmation dialog
and the restore button) are Client Components because they own transient state. The
counting rules live in `lib/domain/` rather than inside the action so they can be unit
tested without a database, which is what Principle III requires of them.

## Phase notes

**What is deliberately not built**: permanent deletion, an audit trail of who deleted what,
bulk restore, a retention window, and the same treatment for roles and people. All are
recorded in the spec's Out of Scope.

**Order of work**: restore first (User Story 1), because the warning in User Story 2
promises recovery and that promise has to be true before it is printed.

## Complexity Tracking

No constitution violations. No entries.
