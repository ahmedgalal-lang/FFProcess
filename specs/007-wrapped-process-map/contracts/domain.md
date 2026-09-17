# Contracts: the wrapping function

One pure function, in `lib/domain/process-layout.ts` beside the geometry it uses.

## `wrapProcessMap`

```
wrapProcessMap(
  steps: { id, assignedRoleId, swimlaneRoleId, positionX, positionY }[],
  options: { boxWidth: number; laneLabel: (roleId: string | null) => string }
): WrappedMapLayout
```

**Behaviour**

1. Capacity is `max(2, floor(boxWidth / STEP_X_SPACING))`. The floor of two stops a narrow
   box from producing one step per row, which is a column, not a map.
2. Steps are ordered by `positionX`, then `positionY`, then `id` — the last so the layout
   is stable for two steps at identical coordinates rather than depending on array order.
3. `steps.length <= capacity` returns `wrapped: false` with one row. The caller takes its
   existing path.
4. Otherwise steps are dealt into rows of `capacity`, each row computing its own lanes from
   the roles present on it, ordered by the whole-process lane order.

**Total.** No input throws: an empty step list returns an empty layout, and a `boxWidth` of
zero or less still yields the minimum capacity. Every caller is rendering a document
someone is waiting for.

**Pure.** No DOM, no Prisma, no React — which is what lets the row-and-lane arithmetic be
unit-tested without rendering anything, as Principle III asks of geometry that decides what
a client sees.

---

## `crossRowMarkers`

```
crossRowMarkers(
  layout: WrappedMapLayout,
  connections: { fromStepId: string; toStepId: string }[]
): CrossRowMarker[]
```

Returns a marker at each end of every connection whose steps land on different rows.
Same-row connections produce nothing — they are still drawn as edges.

---

## Unchanged

`assignSwimlanes`, `laneY`, `nextStepX` and `NODE_HALF_SIZE` keep their signatures and
their callers. The interactive Process Map does not call either new function.
