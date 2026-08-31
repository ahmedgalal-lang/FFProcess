/**
 * Reading a value chain out of a spreadsheet.
 *
 * The shape this understands is the one consultants actually build in Excel: a
 * header row, then one row per activity with a phase, an owner, some supporting
 * departments and a description. Column *positions* are not assumed — headers
 * are matched by name, because the same table gets rebuilt with the columns in
 * a different order every engagement.
 *
 * Pure: rows of cell text in, a checked plan out. Nothing here reads a file or
 * touches a database, so every parsing rule below is unit-testable.
 */

export type ImportedActivity = {
  phase: string;
  label: string;
  owner: string | null;
  support: string[];
  description: string;
  /** 1-based row in the sheet, so a problem can be pointed at. */
  sourceRow: number;
};

export type ImportPlan = {
  activities: ImportedActivity[];
  /** Phase names in the order they first appear — the value chain's sequence. */
  phases: string[];
  /** Every distinct department, whether it owns or supports. */
  departments: string[];
  /** Rows that couldn't be used, and why. */
  skipped: { sourceRow: number; reason: string }[];
};

export type HeaderMatch = {
  phase: number;
  label: number;
  owner: number;
  support: number;
  description: number;
};

/** Header spellings seen in the wild, matched loosely against the real header. */
const HEADER_ALIASES: Record<keyof HeaderMatch, string[]> = {
  phase: ["phase", "stage"],
  label: ["step", "activity", "step / activity", "task"],
  owner: ["primary owner", "owner", "responsible", "department"],
  support: ["supporting departments", "supporting", "support", "involved"],
  description: ["description", "description / integration", "integration", "notes"],
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Finds which column is which from the header row. A column matches on the
 * longest alias it contains, so "Step / Activity" is read as the label rather
 * than being claimed by a shorter, vaguer alias in another group.
 */
export function matchHeaders(headerRow: string[]): HeaderMatch | null {
  const cells = headerRow.map(normalize);
  const found: Partial<HeaderMatch> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof HeaderMatch, string[]][]) {
    let best = -1;
    let bestLength = 0;
    cells.forEach((cell, index) => {
      if (!cell) return;
      for (const alias of aliases) {
        if (cell.includes(alias) && alias.length > bestLength) {
          best = index;
          bestLength = alias.length;
        }
      }
    });
    if (best !== -1) found[field] = best;
  }

  // A table without a phase and an activity isn't a value chain, whatever else
  // it has; the rest can be missing and simply come through blank.
  if (found.phase === undefined || found.label === undefined) return null;

  return {
    phase: found.phase,
    label: found.label,
    owner: found.owner ?? -1,
    support: found.support ?? -1,
    description: found.description ?? -1,
  };
}

/** The row a header sits on, searching from the top; -1 when there isn't one. */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (matchHeaders(rows[i] ?? [])) return i;
  }
  return -1;
}

/**
 * Splits a supporting-departments cell into names. Spreadsheets carry a lot of
 * "none" markers — a bare dash, an empty cell, a dash stuck to the front of a
 * real name — and each has to be read as what a person meant by it, not copied
 * in as a department called "-".
 */
export function parseDepartments(cell: string): string[] {
  return cell
    .split(/[,;\n]|\s+\/\s+/)
    .map((part) => part.replace(/^[-–—\s]+/, "").replace(/[-–—\s]+$/, "").trim())
    .filter((part) => part.length > 0 && part !== "-" && normalize(part) !== "n/a" && normalize(part) !== "none");
}

/**
 * Turns sheet rows into a plan. Rows with no activity name are skipped rather
 * than imported blank — a spreadsheet's trailing empty rows are not activities,
 * and neither is a spacer row someone left in the middle.
 */
export function buildImportPlan(rows: string[][]): ImportPlan {
  const headerIndex = findHeaderRow(rows);
  if (headerIndex === -1) {
    return {
      activities: [],
      phases: [],
      departments: [],
      skipped: [{ sourceRow: 1, reason: "No header row with a Phase and a Step / Activity column." }],
    };
  }

  const headers = matchHeaders(rows[headerIndex]!)!;
  const activities: ImportedActivity[] = [];
  const skipped: ImportPlan["skipped"] = [];

  const at = (row: string[], index: number) => (index === -1 ? "" : (row[index] ?? "").trim());

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const sourceRow = i + 1;
    const label = at(row, headers.label);
    const phase = at(row, headers.phase);

    if (!label && !phase && row.every((c) => !c.trim())) continue; // a blank row is not a problem
    if (!label) {
      skipped.push({ sourceRow, reason: "No activity name." });
      continue;
    }
    if (!phase) {
      skipped.push({ sourceRow, reason: `"${label}" has no phase.` });
      continue;
    }

    const owner = parseDepartments(at(row, headers.owner));
    activities.push({
      phase,
      label,
      owner: owner[0] ?? null,
      support: parseDepartments(at(row, headers.support)),
      description: at(row, headers.description),
      sourceRow,
    });
  }

  const phases: string[] = [];
  for (const activity of activities) {
    if (!phases.includes(activity.phase)) phases.push(activity.phase);
  }

  // One department per name, case-insensitively — a sheet routinely spells the
  // same team "Technical Office" in one cell and "Technical office" in the
  // next, and importing both would create two departments for one team. The
  // first spelling seen is the one kept.
  const departments: string[] = [];
  const seenDepartments = new Set<string>();
  for (const activity of activities) {
    for (const name of [activity.owner, ...activity.support]) {
      if (!name) continue;
      const key = normalize(name);
      if (seenDepartments.has(key)) continue;
      seenDepartments.add(key);
      departments.push(name);
    }
  }

  return { activities, phases, departments, skipped };
}
