# Contracts: Process Ordering

Three interfaces change. Two are internal (a pure domain module and a server action); one is
the user-visible report link, which is the only externally shareable surface here.

## 1. Domain module — `lib/domain/process-order.ts` (new)

Pure, framework-free, ids in / ids out, matching `lib/domain/step-order.ts`. This is where the
business rules live and where they are unit-tested (Principle III).

```ts
/** A process as far as ordering is concerned — nothing about its content. */
export type OrderableProcess = {
  id: string;
  code: string;
  order: number;
  parentProcessId: string | null;
};

/**
 * The workspace's processes in display order: top-level processes by
 * (order, code), each followed by its own children in the same comparator.
 * An orphan — a sub-process whose parent isn't in the list — is ordered
 * among the top-level ones rather than dropped.
 */
export function orderProcessesForDisplay(processes: OrderableProcess[]): OrderableProcess[];

/**
 * Moves one process one place within its sibling group. Returns the input
 * unchanged when the id is unknown, or it is already at the end it is moving
 * toward — a no-op, never an error.
 */
export function moveProcessInOrder(
  processes: OrderableProcess[],
  processId: string,
  direction: "UP" | "DOWN"
): OrderableProcess[];

/** Position a newly created process should take at its level: after the last sibling. */
export function nextOrderForLevel(
  processes: OrderableProcess[],
  parentProcessId: string | null
): number;

/**
 * Applies a pack's chosen sequence to the processes it names. Ids not named
 * keep their relative display order and follow the named ones, so a partial
 * or stale sequence still yields a complete, deterministic list.
 */
export function applyPackOrder<T extends { id: string }>(items: T[], orderedIds: string[]): T[];
```

**Contract notes**
- Every function is total: no throwing, no partial results. Unknown ids are ignored rather than
  rejected, because the lists these run against can change under a form.
- `applyPackOrder` is generic so the report and the PPTX both use it on their own row types
  without either owning the rule.

## 2. Server action — `reorderProcesses`

Mirrors `reorderProcessSteps` in `lib/actions/process.ts`, including its permutation check.

```ts
const reorderProcessesSchema = z.object({
  workspaceId: z.string().min(1),
  /** null = the workspace's top-level processes; otherwise that parent's children. */
  parentProcessId: z.string().min(1).nullable(),
  orderedProcessIds: z.array(z.string().min(1)),
});

export async function reorderProcesses(
  input: z.infer<typeof reorderProcessesSchema>
): Promise<ActionResult<{ orderedProcessIds: string[] }>>;
```

| Condition | Result |
|-----------|--------|
| Input fails schema | `validationError` |
| Requester lacks `EDITOR` on the workspace | the access failure, unchanged |
| Any id is outside the workspace, or the set is not exactly that level's processes | `validationError("That order doesn't match this workspace's processes.")` |
| Otherwise | positions written `0..n-1` in one transaction; `ok({ orderedProcessIds })` |

Revalidates the Processes page and the export picker, the two server-rendered lists that show
the library order.

## 3. Report link — the pack's order (user-visible)

**Unchanged in shape, newly meaningful in sequence.**

```
/reports/{workspaceId}?ids={processId}&ids={processId}&…
```

| Aspect | Before | After |
|--------|--------|-------|
| Which processes the report covers | the `ids` set | unchanged |
| The order they appear in | ignored; report sorted by `code` | **the order the `ids` appear in the link** |
| Sharing the link | reproduces the same content | reproduces the same content *and* the same order |

The same query is read by the PPTX route (`/api/export/report/{workspaceId}`), which shares
`loadReportData`, so both exports follow one sequence and cannot drift (FR-009).

**Robustness** (per the spec's edge cases): the sequence is applied as a *sort*, never a filter.
An id naming a process that no longer exists is skipped; a process present but not named still
appears, after the named ones, in library order. A report link is never rejected for having a
stale or partial sequence.
