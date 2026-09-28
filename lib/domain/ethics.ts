/** The ethics case register's presentation rules (spec 022) — pure. */

/** A case's human-readable reference within its workspace, e.g. CASE-0007. */
export function formatCaseReference(number: number): string {
  return `CASE-${String(number).padStart(4, "0")}`;
}
