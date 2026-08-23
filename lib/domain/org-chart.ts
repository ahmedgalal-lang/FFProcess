/**
 * Org chart reporting-line rules and layout. Pure and framework-free
 * (Constitution Principle III / process-layout.ts precedent: layout itself
 * is presentational and tested lightly, but cycle prevention is a real
 * business rule and is tested accordingly).
 */

/**
 * True if setting `candidateManagerId` as `personId`'s manager would make
 * `personId` its own ancestor, walking the existing manager chain upward.
 * Mirrors wouldCreateCycle in process-hierarchy.ts for the same reason:
 * Person.managerId is a self-referencing hierarchy with the same cycle risk.
 */
export function wouldCreateManagerCycle(
  personId: string,
  candidateManagerId: string,
  managerOf: Map<string, string | null>
): boolean {
  let current: string | null = candidateManagerId;
  const visited = new Set<string>();

  while (current !== null) {
    if (current === personId) return true;
    if (visited.has(current)) return true; // guards against a pre-existing cycle in the data
    visited.add(current);
    current = managerOf.get(current) ?? null;
  }

  return false;
}

export type ChartPerson = { id: string; name: string; managerId: string | null };
export type ChartPosition = { id: string; x: number; y: number; depth: number };

export const CHART_LEVEL_HEIGHT = 140;
export const CHART_NODE_SPACING = 190;

/**
 * Lays out an org chart as a layered tree: depth = distance from a root
 * (someone with no manager, or whose manager isn't in this set — e.g. an
 * archived manager), x = centered above the midpoint of their reports.
 * A person whose manager chain loops back on itself (shouldn't happen —
 * wouldCreateManagerCycle blocks it at write time — but defends against
 * stale/imported data) is placed as its own root rather than infinite-looping.
 */
export function layoutOrgChart(people: ChartPerson[]): ChartPosition[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const isRoot = (p: ChartPerson) => !p.managerId || !byId.has(p.managerId);

  const childrenOf = new Map<string, string[]>();
  for (const p of people) {
    if (!isRoot(p)) {
      const list = childrenOf.get(p.managerId!) ?? [];
      list.push(p.id);
      childrenOf.set(p.managerId!, list);
    }
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name));
  }

  const roots = people.filter(isRoot).sort((a, b) => a.name.localeCompare(b.name));

  const positions = new Map<string, ChartPosition>();
  const visiting = new Set<string>();
  let nextSlot = 0;

  function place(id: string, depth: number): number {
    if (visiting.has(id) || positions.has(id)) return nextSlot++;
    visiting.add(id);

    const kids = (childrenOf.get(id) ?? []).filter((k) => !visiting.has(k) && !positions.has(k));
    const slot = kids.length === 0 ? nextSlot++ : average(kids.map((k) => place(k, depth + 1)));

    positions.set(id, { id, x: slot * CHART_NODE_SPACING, y: depth * CHART_LEVEL_HEIGHT, depth });
    visiting.delete(id);
    return slot;
  }

  for (const r of roots) place(r.id, 0);
  // Anyone left out (a cycle not rooted above) still gets placed, as their own root.
  for (const p of people) if (!positions.has(p.id)) place(p.id, 0);

  return [...positions.values()];
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
