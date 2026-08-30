/**
 * Where each step sits in a Process Map's Steps List.
 *
 * Order used to be implied by creation time, which meant a step you added
 * later — the one you'd forgotten — was stranded at the bottom however it was
 * connected. These are the pure operations behind fixing that: move a step,
 * work out where an inserted step belongs, and put the whole list back into
 * the order the connections imply.
 *
 * Framework-free (Constitution Principle III) — ids in, ids out — so the
 * ordering rules are unit-testable without a database.
 */

export type FlowConnection = { fromStepId: string; toStepId: string };

/**
 * Moves one step one place up or down. Returns the ids unchanged when the step
 * isn't in the list, or is already at the end it's being moved toward.
 */
export function moveStepInOrder(
  orderedStepIds: string[],
  stepId: string,
  direction: "UP" | "DOWN"
): string[] {
  const from = orderedStepIds.indexOf(stepId);
  if (from === -1) return orderedStepIds;

  const to = direction === "UP" ? from - 1 : from + 1;
  if (to < 0 || to >= orderedStepIds.length) return orderedStepIds;

  const next = [...orderedStepIds];
  next[from] = next[to]!;
  next[to] = stepId;
  return next;
}

/**
 * Position a newly added step should take: straight after `afterStepId`, or at
 * the end when that's null (the old behaviour, still the default). An unknown
 * id also means the end rather than an error — the list it came from may have
 * changed under the form.
 */
export function insertPositionAfter(orderedStepIds: string[], afterStepId: string | null): number {
  if (!afterStepId) return orderedStepIds.length;
  const index = orderedStepIds.indexOf(afterStepId);
  return index === -1 ? orderedStepIds.length : index + 1;
}

/** Puts `stepId` at `position`, shifting whatever is there and after it down. */
export function insertStepAt(orderedStepIds: string[], stepId: string, position: number): string[] {
  const without = orderedStepIds.filter((id) => id !== stepId);
  const clamped = Math.max(0, Math.min(position, without.length));
  return [...without.slice(0, clamped), stepId, ...without.slice(clamped)];
}

/**
 * Edges that close a loop — a connector pointing back at a step the flow has
 * already passed through, like a rejected approval routing back to a revise
 * step. Found by depth-first search: an edge into a step still open on the
 * search stack is going backwards. They're excluded from the depth
 * calculation below, because a loop-back doesn't move the process forward and
 * a graph with one has no finite longest path.
 */
function findBackEdges(orderedStepIds: string[], edges: FlowConnection[]): Set<string> {
  const successors = new Map<string, string[]>(orderedStepIds.map((id) => [id, []]));
  for (const edge of edges) successors.get(edge.fromStepId)!.push(edge.toStepId);

  const OPEN = 1;
  const CLOSED = 2;
  const state = new Map<string, number>();
  const backEdges = new Set<string>();

  function visit(start: string) {
    // An explicit stack rather than recursion — a long map would otherwise be
    // one deep call chain. Each frame remembers how far through its successors
    // it has got, so a step is only closed once all of them are done.
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    state.set(start, OPEN);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const children = successors.get(frame.id)!;
      if (frame.next >= children.length) {
        state.set(frame.id, CLOSED);
        stack.pop();
        continue;
      }
      const child = children[frame.next++]!;
      if (state.get(child) === OPEN) backEdges.add(`${frame.id}\u0000${child}`);
      else if (state.get(child) === undefined) {
        state.set(child, OPEN);
        stack.push({ id: child, next: 0 });
      }
    }
  }

  // Entry points first, so the search follows the process the way it runs;
  // anything left over (only reachable inside a loop) is picked up after.
  const hasIncoming = new Set(edges.map((e) => e.toStepId));
  for (const id of orderedStepIds) if (!hasIncoming.has(id) && !state.has(id)) visit(id);
  for (const id of orderedStepIds) if (!state.has(id)) visit(id);

  return backEdges;
}

/**
 * Re-orders the list by how far into the flow each step is: its longest path
 * from an entry point, with the steps already in the list breaking ties so
 * parallel branches keep the order someone put them in.
 *
 * Depth rather than a plain topological sort, because a topological sort has
 * too much freedom. A step added late is a valid successor of its predecessor
 * *and* a valid last-in-the-list, so the sort is free to leave it stranded at
 * the bottom — which is the exact problem this is meant to fix. Depth pins it
 * beside the other steps the same distance into the process.
 *
 * Every step comes out exactly once whatever the shape of the connections.
 */
export function arrangeByFlow(orderedStepIds: string[], connections: FlowConnection[]): string[] {
  const present = new Set(orderedStepIds);
  const edges = connections.filter(
    (c) => present.has(c.fromStepId) && present.has(c.toStepId) && c.fromStepId !== c.toStepId
  );

  const backEdges = findBackEdges(orderedStepIds, edges);
  const forwardEdges = edges.filter((e) => !backEdges.has(`${e.fromStepId}\u0000${e.toStepId}`));

  const depth = new Map(orderedStepIds.map((id) => [id, 0]));
  for (let pass = 0; pass < orderedStepIds.length; pass++) {
    let changed = false;
    for (const edge of forwardEdges) {
      const candidate = depth.get(edge.fromStepId)! + 1;
      if (candidate > depth.get(edge.toStepId)!) {
        depth.set(edge.toStepId, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return orderedStepIds
    .map((id, index) => ({ id, index }))
    .sort((a, b) => depth.get(a.id)! - depth.get(b.id)! || a.index - b.index)
    .map((entry) => entry.id);
}
