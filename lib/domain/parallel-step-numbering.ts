/**
 * What number (or lettered pair) a step displays, in the Steps List and on
 * the printed report (spec 016).
 *
 * Two or more steps that both directly feed a step whose arrival rule is
 * "requires all" (spec 015), with no path between them, aren't sequential —
 * neither has to finish before the other — so consecutive whole numbers
 * (4, 5) misrepresent them. This computes a display-only label ("4a", "4b")
 * for that case, and plain `String(order)` for every other step, including
 * every step in a process that never uses "requires all" at all.
 *
 * A step's stored `order` (its real position — used for move up/down,
 * arrange-by-flow, and every internal layout computation in
 * print-map-layout.ts) is never read back from this function's output and
 * never changes; this only decides what character(s) a renderer prints.
 *
 * Pure and framework-free (Constitution Principle III) — ids and orders in,
 * a label per id out — so it's unit-testable without a database, and the
 * two call sites (map-view.tsx, printed-process-map.tsx) are the only
 * things that turn a label into something on screen or on paper.
 */

export type NumberingStepInput = { id: string; order: number };
export type NumberingConnectionInput = { fromStepId: string; toStepId: string };

/**
 * True when `to` is reachable from `from` by following connections in their
 * stored direction, zero or more hops. Cycle-safe via a visited set — this
 * domain already permits cycles (spec 013).
 */
function reachable(from: string, to: string, successors: Map<string, string[]>): boolean {
  if (from === to) return true;
  const visited = new Set<string>([from]);
  const stack = [...(successors.get(from) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (next === to) return true;
    if (visited.has(next)) continue;
    visited.add(next);
    stack.push(...(successors.get(next) ?? []));
  }
  return false;
}

export function computeStepNumberLabels(
  steps: NumberingStepInput[],
  connections: NumberingConnectionInput[],
  joinRequiresAllIds: Set<string>
): Map<string, string> {
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  const orderById = new Map(ordered.map((s) => [s.id, s.order]));

  const successors = new Map<string, string[]>();
  const predecessorsOf = new Map<string, string[]>();
  for (const c of connections) {
    (successors.get(c.fromStepId) ?? successors.set(c.fromStepId, []).get(c.fromStepId)!).push(c.toStepId);
    (predecessorsOf.get(c.toStepId) ?? predecessorsOf.set(c.toStepId, []).get(c.toStepId)!).push(c.fromStepId);
  }

  // groupId per step — the joinRequiresAll step's own id doubles as its
  // predecessor group's identity, since a step has at most one arrival rule.
  const groupOf = new Map<string, string>();

  for (const joinId of joinRequiresAllIds) {
    const candidates = [...new Set(predecessorsOf.get(joinId) ?? [])].filter((id) => orderById.has(id));
    if (candidates.length < 2) continue;

    const excluded = new Set<string>();
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i]!;
        const b = candidates[j]!;
        if (reachable(a, b, successors) || reachable(b, a, successors)) {
          excluded.add(a);
          excluded.add(b);
        }
      }
    }

    const group = candidates.filter((id) => !excluded.has(id));
    if (group.length < 2) continue;

    // Contiguous in Steps List order: every order between the group's min
    // and max member must itself belong to the group (research.md Decision 2).
    const groupOrders = group.map((id) => orderById.get(id)!).sort((a, b) => a - b);
    const minOrder = groupOrders[0]!;
    const maxOrder = groupOrders.at(-1)!;
    const spanned = ordered.filter((s) => s.order >= minOrder && s.order <= maxOrder);
    const contiguous = spanned.every((s) => group.includes(s.id));
    if (!contiguous) continue;

    for (const id of group) groupOf.set(id, joinId);
  }

  const labels = new Map<string, string>();
  let counter = 1;
  const groupProgress = new Map<string, { base: number; nextLetter: number; remaining: number }>();
  const groupSize = new Map<string, number>();
  for (const groupId of groupOf.values()) groupSize.set(groupId, (groupSize.get(groupId) ?? 0) + 1);

  for (const step of ordered) {
    const groupId = groupOf.get(step.id);
    if (!groupId) {
      labels.set(step.id, String(counter));
      counter += 1;
      continue;
    }

    let progress = groupProgress.get(groupId);
    if (!progress) {
      progress = { base: counter, nextLetter: 0, remaining: groupSize.get(groupId)! };
      groupProgress.set(groupId, progress);
    }

    const letter = String.fromCharCode(97 + progress.nextLetter); // 'a', 'b', 'c', …
    labels.set(step.id, `${progress.base}${letter}`);
    progress.nextLetter += 1;
    progress.remaining -= 1;
    if (progress.remaining === 0) counter += 1; // the whole group consumed one slot
  }

  return labels;
}
