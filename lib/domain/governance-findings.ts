/**
 * Persisting a governance assessment's checklist items and risks across
 * re-runs: matching a fresh AI result against what's already stored so a
 * re-run doesn't duplicate what the consultant is already tracking, and
 * doesn't resurrect what they've dismissed or overwrite what they've edited
 * by hand.
 *
 * This is deliberately thin. review-findings.ts already solved "don't
 * resurrect a dismissed title, don't duplicate a tracked one" for AI Process
 * Review; normalizeFindingTitle is imported from there rather than
 * reimplemented (research.md Decision 3) — a second copy of that rule is
 * exactly the kind of drift the connector-routing work this session found
 * between chooseHandles and chooseHandlesAt, two copies of one rule that had
 * already disagreed by the time it was noticed.
 *
 * What this file adds on top, because a governance assessment has two things
 * AI Process Review didn't:
 *
 *   - a **risk register that isn't scoped to one focus area** (FR-011), so its
 *     reconciliation set has to be built from every risk in the workspace, not
 *     just the ones the current focus area has surfaced before — see
 *     partitionNewRisks's own doc comment;
 *   - a **hand-managed** guard covering three different "a person touched
 *     this" signals — a policy's EDITED status, a checklist item's DONE/
 *     DISMISSED status, and a risk's dedicated handManaged flag (its own
 *     status enum doesn't carry that signal the way GovernanceItemStatus
 *     does) — unified behind one function so a caller checks one thing
 *     rather than three different fields for three different row types.
 *
 * Framework-free — titles and flags in, booleans and arrays out — so it's
 * unit-testable without the database (Constitution Principle III).
 */

export { normalizeFindingTitle } from "./review-findings";
import { normalizeFindingTitle } from "./review-findings";

/**
 * Filters a fresh AI result down to genuinely new checklist items: not a
 * title the assessment already has a row for, whatever that row's status is.
 * DONE and DISMISSED are "already tracked" exactly as much as OPEN is — the
 * caller passes every title this assessment already has, not merely the ones
 * still open, which is what stops a dismissed item reappearing as fresh.
 */
export function partitionNewChecklistItems<T extends { title: string }>(
  rawItems: T[],
  trackedTitles: ReadonlySet<string>
): T[] {
  return rawItems.filter((item) => !trackedTitles.has(normalizeFindingTitle(item.title)));
}

/**
 * Filters a fresh AI result down to genuinely new risks.
 *
 * Identical logic to partitionNewChecklistItems, kept as its own function
 * rather than one shared generic because the *caller obligation* differs in a
 * way worth keeping separate in the type signature's neighbourhood: a
 * checklist item is scoped to one (workspace, focus area) assessment, so its
 * tracked-titles set is built from that one assessment's own items. A risk is
 * not scoped to a focus area at all (FR-011) — the caller must build
 * `trackedTitles` from every risk already on the *workspace's* register,
 * regardless of which focus area's run originally surfaced it, or a risk
 * found while assessing Risk & Controls would be free to reappear as a
 * "new" one the next time Board Structure is generated.
 */
export function partitionNewRisks<T extends { title: string }>(
  rawRisks: T[],
  trackedTitles: ReadonlySet<string>
): T[] {
  return rawRisks.filter((risk) => !trackedTitles.has(normalizeFindingTitle(risk.title)));
}

/** The one field common to a policy draft or a checklist item: its own status. */
type StatusRow = { status: string };
/** A risk additionally carries a dedicated flag, since its status enum doesn't mean "touched by hand". */
type RiskRow = { status: string; handManaged: boolean };

/**
 * True when a row must not be overwritten by a fresh generation run.
 *
 * Three signals, one function:
 *   - a GovernancePolicyDraft is hand-managed once its status is EDITED —
 *     set the moment updatePolicyDraft changes the body;
 *   - a GovernanceChecklistItem is hand-managed once its status is DONE or
 *     DISMISSED — both only ever reachable through a consultant's own action
 *     (setChecklistItemStatus), never something a generation run sets;
 *   - a GovernanceRisk carries its own `handManaged` flag rather than relying
 *     on its status, because RiskStatus (OPEN/MITIGATING/ACCEPTED/CLOSED)
 *     doesn't have a value meaning "still exactly as the model wrote it" —
 *     OPEN is both the AI's own starting status and a legitimate value a
 *     consultant might deliberately set, so the two can't be told apart from
 *     status alone.
 */
export function isHandManaged(row: StatusRow | RiskRow): boolean {
  if ("handManaged" in row) return row.handManaged;
  return row.status === "EDITED" || row.status === "DONE" || row.status === "DISMISSED";
}
