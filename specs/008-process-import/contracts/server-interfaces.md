# Contract: Server Interfaces

**Feature**: `specs/008-process-import`

Two server entry points. Both enforce access themselves rather than trusting the page
that rendered the control (Constitution Principle V, FR-023).

---

## 1. Template download

```
GET /api/template/process-import/{workspaceId}
```

**File**: `app/api/template/process-import/[workspaceId]/route.ts`

**Access**: `requireWorkspaceAccess(workspaceId, "EDITOR")`. Note this is stricter
than the five existing routes under `app/api/export/`, which gate at `VIEWER` —
FR-024 makes the download itself editor-only.

| Outcome | Status | Body |
|---|---|---|
| Editor or above | `200` | The `.xlsx`, `Content-Disposition: attachment; filename="process-import-template.xlsx"` |
| Signed out | `401` | `{ ok: false, error: "UNAUTHORIZED" }` |
| Viewer | `403` | `{ ok: false, error: "FORBIDDEN" }` |
| No such workspace, or not a member | `404` | `{ ok: false, error: "NOT_FOUND" }` |

The workbook is generated per request from the shared sheet declaration. Nothing is
stored, and the file does not depend on the workspace's contents — the same bytes for
every editor.

---

## 2. Import

```ts
importProcess(formData: FormData): Promise<ActionResult<{
  summary: ImportSummary;
  created?: { processId: string; code: string };
}>>
```

**File**: `lib/actions/process-import.ts` (`"use server"`)

**Form fields**

| Field | Type | Notes |
|---|---|---|
| `workspaceId` | string | |
| `file` | File | The filled-in `.xlsx`, at most 4 MB |
| `dryRun` | `"true"` \| `"false"` | `true` previews, `false` writes |

Validated with Zod at the boundary before anything else (Constitution Principle I).

**Access**: `requireWorkspaceAccess(workspaceId, "EDITOR")`, on both calls. A viewer
posting this directly is refused (FR-023, SC-007).

**Behaviour**

| Call | Result |
|---|---|
| `dryRun: true`, file parses | `ok({ summary })`. **Nothing is written** |
| `dryRun: true`, problems found | `ok({ summary })` with `summary.problems` non-empty. Nothing written |
| `dryRun: true`, not this template | `validationError` naming what was expected (FR-022) |
| `dryRun: false`, no problems | `ok({ summary, created })` — one transaction, or nothing (FR-019) |
| `dryRun: false`, problems found | `validationError`; **nothing is written** (FR-018) |
| Over 4 MB, or over 300 steps | `validationError` naming the limit |

The file is re-uploaded and re-parsed on the confirming call; no parse is held between
the two (research R5). Parsing is deterministic, so the import that runs is the one
that was previewed.

**On success**: revalidates `/workspaces/{workspaceId}/processes` and the new
process's own pages.

**Guarantees**

- Only ever creates a process. Never updates or replaces one (FR-025).
- No process other than the new one is changed (FR-026). Roles and people that already
  exist are read, not rewritten (FR-012).
- The process code comes from `generateProcessCode`, never from the file (FR-014).

---

## 3. Pure parser

```ts
// lib/domain/process-import.ts
function parseWorkbook(sheets: Record<string, string[][]>): ImportPlan
```

No file reading, no database, no framework — rows of cell text in, a checked plan out,
the same shape as `lib/domain/value-chain-import.ts`. This is where the business rules
live and where they are tested (Constitution Principle III).
