/**
 * Which parts of the Export Report pack appear, and in what order.
 *
 * Three ideas, deliberately kept apart:
 *
 *   - The **catalogue** below is the only place that knows a section or block
 *     exists. It is code, not data.
 *   - The **stored arrangement** (Workspace.reportArrangement) records a
 *     client's choices about the catalogue: what is included, in what order,
 *     and which section each block sits under.
 *   - **Emptiness** is neither. Whether a block has anything to show is decided
 *     per process at render time, so filling in a client's KPIs makes the
 *     "no data yet" mark disappear without anyone rearranging anything.
 *
 * Keeping the catalogue out of the stored value is what makes a section added
 * to the product later show up for clients arranged before it existed, instead
 * of being hidden from them forever with no error to notice.
 */

export type SectionKind = "pack" | "process";

export type SectionSpec = {
  id: string;
  title: string;
  kind: SectionKind;
  /** Cannot be excluded — a document without one of these is not a pack. */
  locked?: true;
};

export type BlockSpec = {
  id: string;
  title: string;
  /** The process section this block starts life under. */
  defaultSection: string;
  /**
   * Moves as one unit with this block, and offers no move control of its own.
   * The authority rules are a column of the RACI table, not a table of their
   * own, so letting them drift away from the grid would mean a second table
   * shape in the report.
   */
  pinnedTo?: string;
};

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

/**
 * Array order is the default order, and the default order is the order the
 * report prints in today — so "no arrangement" and "today's report" are the
 * same thing by construction rather than by keeping two lists in step.
 */
export const PACK_SECTIONS: readonly SectionSpec[] = [
  { id: "cover", title: "Cover page", kind: "pack", locked: true },
  { id: "org", title: "Org Structure", kind: "pack" },
  { id: "heli", title: "Helicopter View", kind: "pack" },
  { id: "chain", title: "Value Chain", kind: "pack" },
  { id: "index", title: "Processes in This Report", kind: "pack" },
  { id: "closing", title: "Closing page", kind: "pack" },
];

export const PROCESS_SECTIONS: readonly SectionSpec[] = [
  { id: "exec", title: "Executive Summary", kind: "process" },
  { id: "map", title: "Process Map & Narrative", kind: "process" },
  { id: "raci", title: "RACI & Authority Matrix", kind: "process" },
  { id: "gov", title: "Governance, Controls & Metrics", kind: "process" },
];

export const BLOCKS: readonly BlockSpec[] = [
  { id: "purpose", title: "Process Purpose", defaultSection: "exec" },
  { id: "trigger", title: "Trigger & Output", defaultSection: "exec" },
  { id: "roles", title: "Internal Roles", defaultSection: "exec" },
  { id: "ext", title: "External Entities", defaultSection: "exec" },
  { id: "scope", title: "Scope", defaultSection: "map" },
  { id: "diagram", title: "Workflow diagram", defaultSection: "map" },
  { id: "narr", title: "Step narrative", defaultSection: "map" },
  { id: "raciGrid", title: "RACI grid", defaultSection: "raci" },
  { id: "rules", title: "Authority rules", defaultSection: "raci", pinnedTo: "raciGrid" },
  { id: "controls", title: "Key Control Points", defaultSection: "gov" },
  { id: "kpis", title: "Operational KPIs & SLAs", defaultSection: "gov" },
];

/* ------------------------------------------------------------------ */
/* The stored shape                                                    */
/* ------------------------------------------------------------------ */

export const ARRANGEMENT_VERSION = 1;

export type StoredArrangement = {
  version: number;
  pack: { id: string; on: boolean }[];
  sections: { id: string; on: boolean }[];
  blocks: { id: string; on: boolean; sec: string }[];
};

/* ------------------------------------------------------------------ */
/* The read model                                                      */
/* ------------------------------------------------------------------ */

export type ResolvedBlock = {
  id: string;
  title: string;
  on: boolean;
  pinnedTo: string | null;
  /** "1.2", or null when this block or its section is excluded. */
  number: string | null;
};

export type ResolvedSection = {
  id: string;
  title: string;
  kind: SectionKind;
  locked: boolean;
  on: boolean;
  /** "1.0" for an included process section; null for pack sections and excluded ones. */
  number: string | null;
  blocks: ResolvedBlock[];
};

export type ResolvedArrangement = {
  pack: ResolvedSection[];
  sections: ResolvedSection[];
};

/* ------------------------------------------------------------------ */
/* Resolving                                                           */
/* ------------------------------------------------------------------ */

/**
 * Orders catalogue entries by a stored list.
 *
 * Two rules, and the second is the one that matters: stored ids the catalogue
 * no longer knows are dropped, and catalogue entries the stored list never
 * mentions are appended **included**. Without the second, every workspace
 * arranged before a new section shipped would hide it silently.
 */
function orderBy<T extends { id: string }>(
  catalogue: readonly T[],
  stored: { id: string; on: boolean }[] | undefined
): { spec: T; on: boolean }[] {
  const byId = new Map(catalogue.map((c) => [c.id, c]));
  const out: { spec: T; on: boolean }[] = [];
  const seen = new Set<string>();

  for (const entry of stored ?? []) {
    const spec = byId.get(entry.id);
    if (!spec || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push({ spec, on: entry.on !== false });
  }
  for (const spec of catalogue) {
    if (seen.has(spec.id)) continue;
    out.push({ spec, on: true });
  }
  return out;
}

function isStored(value: unknown): value is StoredArrangement {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<StoredArrangement>;
  if (v.version !== ARRANGEMENT_VERSION) return false;
  return Array.isArray(v.pack) && Array.isArray(v.sections) && Array.isArray(v.blocks);
}

/**
 * The stored value turned into what every renderer consumes.
 *
 * Total on purpose: null, malformed JSON, a version from a future release —
 * all fall back to the default arrangement. Every caller is on a render path
 * for a document someone is waiting for, so there is no input for which
 * throwing would be the better answer.
 */
export function resolveArrangement(stored: unknown): ResolvedArrangement {
  const value = isStored(stored) ? stored : null;

  const pack = orderBy(PACK_SECTIONS, value?.pack).map(({ spec, on }) => ({
    id: spec.id,
    title: spec.title,
    kind: spec.kind,
    locked: spec.locked === true,
    // A locked section is included however the stored value is shaped.
    on: spec.locked === true ? true : on,
    number: null,
    blocks: [] as ResolvedBlock[],
  }));

  const sectionOrder = orderBy(PROCESS_SECTIONS, value?.sections);
  const sectionIds = new Set(sectionOrder.map((s) => s.spec.id));

  // Blocks are one flat ordered list carrying which section each sits under,
  // so a block can move past a heading into the next section.
  const storedBlocks = value?.blocks;
  const blockOrder = orderBy(BLOCKS, storedBlocks).map(({ spec, on }) => {
    const stored = storedBlocks?.find((b) => b.id === spec.id);
    const sec = stored?.sec && sectionIds.has(stored.sec) ? stored.sec : spec.defaultSection;
    return { spec, on, sec };
  });

  rejoinPinned(blockOrder);

  let n = 0;
  const sections: ResolvedSection[] = sectionOrder.map(({ spec, on }) => {
    const number = on ? `${++n}.0` : null;
    let m = 0;
    const blocks: ResolvedBlock[] = blockOrder
      .filter((b) => b.sec === spec.id)
      .map((b) => ({
        id: b.spec.id,
        title: b.spec.title,
        on: b.on,
        pinnedTo: b.spec.pinnedTo ?? null,
        // Position among *included* blocks, so excluding one closes the gap
        // instead of leaving a number that skips.
        number: on && b.on ? `${n}.${++m}` : null,
      }));
    return {
      id: spec.id,
      title: spec.title,
      kind: spec.kind,
      locked: spec.locked === true,
      on,
      number,
      blocks,
    };
  });

  return { pack, sections };
}

/**
 * Puts a pinned block back beside the one it is pinned to.
 *
 * Nothing in the interface can separate them, but a hand-edited row or an
 * arrangement saved before the pin existed can. Repairing on read is cheaper
 * than a migration and means the report never has to cope with half a table.
 */
function rejoinPinned(order: { spec: BlockSpec; on: boolean; sec: string }[]): void {
  for (const block of [...order]) {
    if (!block.spec.pinnedTo) continue;
    const anchorAt = order.findIndex((b) => b.spec.id === block.spec.pinnedTo);
    if (anchorAt === -1) continue;
    const at = order.indexOf(block);
    block.sec = order[anchorAt]!.sec;
    if (at === anchorAt + 1) continue;
    order.splice(at, 1);
    order.splice(order.findIndex((b) => b.spec.id === block.spec.pinnedTo) + 1, 0, block);
  }
}

/** The arrangement a workspace nobody has arranged renders with. */
export function defaultArrangement(): ResolvedArrangement {
  return resolveArrangement(null);
}

/* ------------------------------------------------------------------ */
/* Emptiness                                                           */
/* ------------------------------------------------------------------ */

/**
 * The parts of one process's report data that decide whether a block has
 * anything to print.
 *
 * Structural rather than an import of the renderer's own type: this module is
 * consumed by the report, the deck and the export page, and none of them
 * should have to depend on a React component's prop shape to ask whether a
 * block is empty.
 */
export type EmptinessInput = {
  processPurpose?: string | null;
  triggerLabel?: string | null;
  outputLabel?: string | null;
  involvedRoles?: readonly unknown[];
  externalEntities?: readonly unknown[];
  inScope?: readonly unknown[];
  outOfScope?: readonly unknown[];
  steps?: readonly { detailedAction?: readonly unknown[]; exceptionHandling?: string | null }[];
  matrixRoles?: readonly unknown[];
  combinedRows?: readonly { ruleSentences?: readonly unknown[] }[];
  controlPoints?: readonly unknown[];
  kpis?: readonly unknown[];
};

const has = (xs: readonly unknown[] | undefined) => (xs?.length ?? 0) > 0;
const text = (s: string | null | undefined) => Boolean(s && s.trim());

/**
 * One predicate per block. An unknown id is reported empty rather than
 * throwing — a renderer asking about a block the catalogue does not have is a
 * bug, but not one worth failing a client's document over.
 */
const EMPTY_CHECKS: Record<string, (p: EmptinessInput) => boolean> = {
  purpose: (p) => !text(p.processPurpose),
  trigger: (p) => !text(p.triggerLabel) && !text(p.outputLabel),
  roles: (p) => !has(p.involvedRoles),
  ext: (p) => !has(p.externalEntities),
  scope: (p) => !has(p.inScope) && !has(p.outOfScope),
  diagram: (p) => !has(p.steps),
  // The narrative prints only the steps that carry one, which is why an
  // undocumented map makes this block empty while the diagram block is not.
  narr: (p) => !(p.steps ?? []).some((s) => has(s.detailedAction) || text(s.exceptionHandling)),
  raciGrid: (p) => !has(p.combinedRows) || !has(p.matrixRoles),
  rules: (p) => !(p.combinedRows ?? []).some((r) => has(r.ruleSentences)),
  controls: (p) => !has(p.controlPoints),
  kpis: (p) => !has(p.kpis),
};

export function isBlockEmpty(blockId: string, process: EmptinessInput): boolean {
  const check = EMPTY_CHECKS[blockId];
  return check ? check(process) : true;
}

/**
 * A section is empty when every block it will actually print is empty.
 *
 * Excluded blocks are not counted: a block that is not there cannot be the
 * reason a section looks full. A section with no included blocks at all is
 * empty, which is what makes "I moved everything out of it" and "it has no
 * data" print the same way — they mean the same thing to a reader.
 */
export function isSectionEmpty(section: ResolvedSection, process: EmptinessInput): boolean {
  const printed = section.blocks.filter((b) => b.on);
  if (printed.length === 0) return true;
  return printed.every((b) => isBlockEmpty(b.id, process));
}
