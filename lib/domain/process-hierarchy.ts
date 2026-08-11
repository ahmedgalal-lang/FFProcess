/**
 * Process Code uniqueness and main/sub-process hierarchy rules (spec FR-020,
 * FR-022). Pure and framework-free (Constitution Principle III).
 */

export function isCodeAvailable(code: string, existingCodes: string[]): boolean {
  const normalized = code.trim().toUpperCase();
  return !existingCodes.some((c) => c.trim().toUpperCase() === normalized);
}

/**
 * True if setting `candidateParentId` as `processId`'s parent would make
 * `processId` its own ancestor, walking the existing parent chain from
 * `candidateParentId` upward. `parentOf` maps a Process id to its current
 * parent id (or null for a top-level Process).
 */
export function wouldCreateCycle(
  processId: string,
  candidateParentId: string,
  parentOf: Map<string, string | null>
): boolean {
  let current: string | null = candidateParentId;
  const visited = new Set<string>();

  while (current !== null) {
    if (current === processId) return true;
    if (visited.has(current)) return true; // guards against a pre-existing cycle in the data
    visited.add(current);
    current = parentOf.get(current) ?? null;
  }

  return false;
}
