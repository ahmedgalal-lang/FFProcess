/**
 * The order the processes in one exported pack come out in.
 *
 * A report is addressed by a link naming the processes it covers
 * (`/reports/{workspaceId}?ids=…&ids=…`), so that link already carries a
 * sequence. Loading the report used to discard it twice over — a SQL `IN`
 * doesn't preserve argument order, and an `orderBy` on top overrode whatever
 * survived — so every pack came out in process-code order regardless of how it
 * was assembled. This re-applies the sequence the link asked for.
 *
 * Keeping the order in the link rather than in a column is what makes a pack's
 * arrangement affect that pack alone: there is no stored order to write back
 * to, so arranging one pack cannot disturb the workspace or anybody else's.
 * It also means an arranged report stays arranged when its link is shared.
 *
 * Framework-free — items in, items out — so the rule is unit-testable without
 * a database (Constitution Principle III).
 */

/**
 * Sorts `items` into the sequence `orderedIds` names.
 *
 * A *sort*, never a filter, and total by design: report links are out in the
 * world and go stale. An id naming something absent (a deleted process, or one
 * from a workspace the reader can't see and the query already dropped) is
 * skipped; an item the sequence doesn't name still appears, after the named
 * ones, keeping its existing relative position. A link is never rejected, and
 * two loads of unchanged data never differ.
 */
export function applyPackOrder<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  if (orderedIds.length === 0) return items;

  const byId = new Map(items.map((item) => [item.id, item]));
  const named: T[] = [];
  // Tracked separately from `named` so a repeated id yields the item once
  // rather than twice — the second mention finds nothing left to take.
  const taken = new Set<string>();

  for (const id of orderedIds) {
    const item = byId.get(id);
    if (!item || taken.has(id)) continue;
    named.push(item);
    taken.add(id);
  }

  const rest = items.filter((item) => !taken.has(item.id));
  return [...named, ...rest];
}
