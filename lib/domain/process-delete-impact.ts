/**
 * What a consultant is told before they delete a process.
 *
 * Deleting a process is reversible — it sets a timestamp and every query stops
 * returning it — but the confirmation has to say what is about to disappear
 * from view, because a process can carry weeks of mapping. These are the raw
 * counts and the sentences derived from them; the counting queries live in the
 * server action, so the rules about what the numbers *mean* can be tested
 * without a database.
 */

/** The raw counts, as gathered from the database. */
export type ProcessDeleteCounts = {
  /** Process steps on the map. */
  stepCount: number;
  /** RACI assignments reached through this process's activities. */
  raciAssignmentCount: number;
  /** Authority rules reached through this process's authority assignments. */
  authorityRuleCount: number;
  /** Entries in the process's KPI list. */
  kpiCount: number;
  /**
   * Live processes filed beneath this one. Already-deleted sub-processes are
   * excluded by the query: a process that is itself gone is not something the
   * consultant is about to orphan, so counting it would overstate the damage.
   */
  subProcessCount: number;
  /** Live processes that resume from one of this process's steps. */
  branchingCount: number;
};

export type ProcessDeleteImpact = ProcessDeleteCounts & {
  code: string;
  name: string;
  /** Nothing is attached — the confirmation says so instead of printing zeroes. */
  isEmpty: boolean;
  /** One phrase per kind of work attached, e.g. "14 steps". Empty when `isEmpty`. */
  carries: string[];
  /** One sentence per thing left pointing at this process. Empty when nothing does. */
  leavesBehind: string[];
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Turns the counts into what the dialog prints.
 *
 * Only the four "attached work" counts decide `isEmpty`. Sub-processes and
 * branching processes are *not* attached work — they survive the deletion
 * untouched — so a process with no steps but two sub-processes is still an
 * empty process that happens to have children, and the confirmation should say
 * both things rather than let one mask the other.
 */
export function summariseDeleteImpact(
  process: { code: string; name: string },
  counts: ProcessDeleteCounts
): ProcessDeleteImpact {
  const carries: string[] = [];
  if (counts.stepCount > 0) carries.push(plural(counts.stepCount, "step", "steps"));
  if (counts.raciAssignmentCount > 0) {
    carries.push(plural(counts.raciAssignmentCount, "RACI assignment", "RACI assignments"));
  }
  if (counts.authorityRuleCount > 0) {
    carries.push(plural(counts.authorityRuleCount, "authority rule", "authority rules"));
  }
  if (counts.kpiCount > 0) carries.push(plural(counts.kpiCount, "KPI", "KPIs"));

  const leavesBehind: string[] = [];
  if (counts.subProcessCount > 0) {
    leavesBehind.push(
      `${plural(counts.subProcessCount, "sub-process", "sub-processes")} will be left without a parent.`
    );
  }
  if (counts.branchingCount > 0) {
    leavesBehind.push(
      `${plural(counts.branchingCount, "process", "processes")} branching from its steps will lose the starting point they name.`
    );
  }

  return {
    ...counts,
    code: process.code,
    name: process.name,
    isEmpty: carries.length === 0,
    carries,
    leavesBehind,
  };
}
