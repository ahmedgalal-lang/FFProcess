# Contract: the printed map layout module

`lib/domain/print-map-layout.ts` — pure, framework-free, no DOM and no Prisma, like
`process-layout.ts` and `connector-routing.ts` beside it. It decides what the printed map
claims about a process; the renderers only draw what it returns.

## Input

```ts
type LayoutInput = {
  steps: {
    id: string;
    order: number;                 // 1-based, the Steps List order — never positionX
    label: string;
    roleName: string | null;
    kind: "start" | "task" | "decision" | "end";
  }[];
  connections: { id: string; fromStepId: string; toStepId: string; label: string | null }[];
  requested: "FLOW" | "ROLES";
};
```

Steps arrive already sorted by `order`. The module never re-sorts by stored canvas position —
that is the bug spec 011 fixed, and reintroducing it would break hand-arranged processes.

## Output

```ts
type LayoutOutcome =
  | { layout: "FLOW";  flow: FlowOutline;  fellBackFrom?: "ROLES"; reason?: string }
  | { layout: "ROLES"; roles: RolesGrid };
```

Shapes are in [data-model.md](../data-model.md).

## Guarantees

1. **Every step appears exactly once**, in `order`, in whichever layout is returned. (FR-001)
2. **No label is shortened, elided or truncated.** The module passes `label` through whole;
   fitting it is the renderer's job and the renderer does it by wrapping, not cutting.
   (FR-002, FR-017)
3. **A branch label is the label of the connection that reaches that step** — read from that
   connection, never found by searching connections that touch the step. (FR-009)
4. **Deterministic**: the same input yields the same output, every time. Of a decision's
   outgoing connections, the one reaching the next step in `order` continues the spine; the
   rest spur, ordered by their target's `order`.
5. **Indent never exceeds 2.** A branch nested deeper is placed at 2 with a back-reference.
6. **Every connection is accounted for**: each one appears either as a drawn rail/connector
   or in `backReferences`. None is silently dropped. (FR-007, FR-008, SC-006)
7. **`ROLES` is refused above the ceiling.** More than `MAX_ROLE_COLUMNS` (5) distinct roles
   returns a `FLOW` outcome carrying `fellBackFrom: "ROLES"` and a human-readable `reason`.
   It never returns narrow columns and never throws. (FR-023)
8. **Nothing is emitted that points nowhere.** A rail piece or connector is only produced for
   a connection with two ends present in the layout. (FR-010)
9. **Pure.** No clock, no randomness, no I/O. Called from a server component during render.

## Exported constants

| Name | Value | Why it is a constant |
|---|---|---|
| `MAX_ROLE_COLUMNS` | `5` | The role ceiling. Tests assert against the constant, not a literal, so moving it moves the tests with it. |
| `MAX_BRANCH_INDENT` | `2` | The nesting cap. |

## Edge cases the module must handle, not the caller

| Input | Output |
|---|---|
| No steps | `FLOW` with `rows: []`; the renderer shows the empty state |
| One step | one row, `rail: "first"`, `endsHere: true` |
| A step with no role | `roleName: null` — the card says so, the step is not dropped |
| A step with no outgoing connection | `endsHere: true` |
| A connection to a step that is not in this process | not drawn, not in `backReferences`, not an error |
| Two connections between the same pair | both accounted for; at most one drawn |
| A cycle (a loop back to an earlier step) | terminates; the back edge becomes a back-reference |
| Every step the same role | `ROLES` returns one column |
