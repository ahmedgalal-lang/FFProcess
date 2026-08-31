/**
 * The value-chain board: every step across the engagement, laid out in the
 * phase it belongs to, so one page shows how work moves from an RFQ landing to
 * the money being collected — across processes, not inside one.
 *
 * The board groups two ways. **By phase** is the value chain itself, columns in
 * the order the work happens. **By owner** takes the same cards and columns
 * them by the department accountable for each, which answers a different
 * question — how much of the chain sits on one team — from the same data.
 *
 * Pure and framework-free (Constitution Principle III): steps in, columns out,
 * with no Prisma or React, so the grouping, filtering and counting are
 * unit-testable on their own.
 */

/** Column colours, handed out in order as phases are created. */
export const PHASE_COLORS = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#d97706", // amber
  "#059669", // emerald
  "#4f46e5", // indigo
  "#0891b2", // cyan
  "#dc2626", // red
  "#c026d3", // fuchsia
];

/** The colour a phase in this position gets, cycling once the palette runs out. */
export function phaseColorFor(index: number): string {
  return PHASE_COLORS[index % PHASE_COLORS.length]!;
}

export type ActivityCard = {
  stepId: string;
  label: string;
  description: string;
  processId: string;
  processCode: string;
  /** Department accountable for this step, or null when nobody is yet. */
  ownerName: string | null;
  ownerId: string | null;
  supportNames: string[];
  phaseId: string | null;
  /** Codes of processes this step hands off to, so a card shows its links. */
  linksTo: string[];
  isMilestone: boolean;
};

export type PhaseRef = { id: string; name: string; order: number; color: string | null };

export type BoardColumn = {
  key: string;
  title: string;
  color: string | null;
  /** Set for a real phase column; null for the catch-all or an owner column. */
  phaseId: string | null;
  cards: ActivityCard[];
};

export type BoardTotals = {
  activities: number;
  phases: number;
  departments: number;
};

export type BoardFilter = {
  /** Matched against label, description, owner and supporting departments. */
  search?: string;
  /** Role id, or null for "everyone". */
  ownerId?: string | null;
};

/** The name a column uses for work nobody has placed or assigned yet. */
export const UNPHASED_COLUMN = "Unphased";
export const UNOWNED_COLUMN = "Unassigned";

function matches(card: ActivityCard, filter: BoardFilter): boolean {
  if (filter.ownerId && card.ownerId !== filter.ownerId) return false;

  const search = filter.search?.trim().toLowerCase();
  if (!search) return true;

  const haystack = [card.label, card.description, card.ownerName ?? "", ...card.supportNames]
    .join(" ")
    .toLowerCase();
  return haystack.includes(search);
}

/**
 * Columns in phase order, then a catch-all for anything unphased. Every phase
 * gets a column even when nothing is in it — an empty stage of the value chain
 * is information, not something to hide — but the catch-all only appears when
 * there is actually something in it.
 */
export function groupByPhase(
  cards: ActivityCard[],
  phases: PhaseRef[],
  filter: BoardFilter = {}
): BoardColumn[] {
  const visible = cards.filter((card) => matches(card, filter));
  const ordered = [...phases].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const columns: BoardColumn[] = ordered.map((phase) => ({
    key: phase.id,
    title: phase.name,
    color: phase.color,
    phaseId: phase.id,
    cards: visible.filter((card) => card.phaseId === phase.id),
  }));

  const known = new Set(phases.map((p) => p.id));
  const unphased = visible.filter((card) => !card.phaseId || !known.has(card.phaseId));
  if (unphased.length > 0) {
    columns.push({ key: "unphased", title: UNPHASED_COLUMN, color: null, phaseId: null, cards: unphased });
  }

  return columns;
}

/**
 * The same cards columned by the department accountable for each, busiest
 * first, with anything unassigned last however many cards it holds — it's a gap
 * to close, not a department.
 */
export function groupByOwner(cards: ActivityCard[], filter: BoardFilter = {}): BoardColumn[] {
  const visible = cards.filter((card) => matches(card, filter));

  const byOwner = new Map<string, { title: string; cards: ActivityCard[] }>();
  const unowned: ActivityCard[] = [];

  for (const card of visible) {
    if (!card.ownerId || !card.ownerName) {
      unowned.push(card);
      continue;
    }
    const bucket = byOwner.get(card.ownerId) ?? { title: card.ownerName, cards: [] };
    bucket.cards.push(card);
    byOwner.set(card.ownerId, bucket);
  }

  const columns: BoardColumn[] = [...byOwner.entries()]
    .map(([id, bucket]) => ({
      key: id,
      title: bucket.title,
      color: null,
      phaseId: null,
      cards: bucket.cards,
    }))
    .sort((a, b) => b.cards.length - a.cards.length || a.title.localeCompare(b.title));

  if (unowned.length > 0) {
    columns.push({ key: "unowned", title: UNOWNED_COLUMN, color: null, phaseId: null, cards: unowned });
  }

  return columns;
}

/**
 * The headline counts. Departments counts every distinct name that appears as
 * an owner or as support, since both are departments involved in the chain —
 * the number answers "how many parts of the business does this touch".
 */
export function boardTotals(cards: ActivityCard[], phases: PhaseRef[]): BoardTotals {
  const departments = new Set<string>();
  for (const card of cards) {
    if (card.ownerName) departments.add(card.ownerName);
    for (const name of card.supportNames) departments.add(name);
  }

  return { activities: cards.length, phases: phases.length, departments: departments.size };
}

/** Owners that actually appear on the board, for the filter's dropdown. */
export function ownerOptions(cards: ActivityCard[]): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const card of cards) {
    if (card.ownerId && card.ownerName) byId.set(card.ownerId, card.ownerName);
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
