/**
 * Process Code uniqueness and main/sub-process hierarchy rules (spec FR-020,
 * FR-022). Pure and framework-free (Constitution Principle III).
 */

export function isCodeAvailable(code: string, existingCodes: string[]): boolean {
  const normalized = code.trim().toUpperCase();
  return !existingCodes.some((c) => c.trim().toUpperCase() === normalized);
}

/**
 * Auto-generates a Process Code so nobody has to type one (FR-020). A
 * sub-process inherits its parent's alphabetic prefix (e.g. children of
 * "PUR100" become "PUR101", "PUR102", ...) so the hierarchy stays visually
 * grouped; a top-level process derives a 3-letter prefix from the first word
 * of its name. Either way, the numeric suffix picks up one past the highest
 * existing number sharing that prefix, starting at 100.
 */
export function generateProcessCode(params: {
  name: string;
  parentCode: string | null;
  existingCodes: string[];
}): string {
  const prefix = params.parentCode
    ? (params.parentCode.match(/^[A-Za-z]+/)?.[0] ?? "PRC").toUpperCase()
    : deriveNamePrefix(params.name);

  let maxNumber = 99;
  const prefixPattern = new RegExp(`^${prefix}(\\d+)$`, "i");
  for (const code of params.existingCodes) {
    const match = code.trim().match(prefixPattern);
    if (match) maxNumber = Math.max(maxNumber, parseInt(match[1]!, 10));
  }

  return `${prefix}${maxNumber + 1}`;
}

function deriveNamePrefix(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? "";
  const letters = firstWord.replace(/[^A-Za-z]/g, "").toUpperCase();
  return (letters + "XXX").slice(0, 3) || "PRC";
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

/**
 * True if branching `processId` off a step owned by `candidateSourceId` would
 * make the process its own origin, walking the existing branch chain upward.
 * `branchSourceOf` maps a Process id to the id of the Process whose step it
 * branches from (or null when it starts on its own).
 *
 * Separate from wouldCreateCycle: a process's parent (filing) and the process
 * it resumes from (flow) are independent, so each needs its own guard.
 */
export function wouldCreateBranchCycle(
  processId: string,
  candidateSourceId: string,
  branchSourceOf: Map<string, string | null>
): boolean {
  let current: string | null = candidateSourceId;
  const visited = new Set<string>();

  while (current !== null) {
    if (current === processId) return true;
    if (visited.has(current)) return true; // guards against a pre-existing cycle in the data
    visited.add(current);
    current = branchSourceOf.get(current) ?? null;
  }

  return false;
}
