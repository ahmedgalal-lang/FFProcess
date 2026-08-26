/**
 * Pure logic for persisting AI Review findings across re-runs: matching a
 * fresh AI result against what's already stored so a re-run doesn't
 * duplicate findings the user is already tracking, and doesn't resurrect
 * ones they've dismissed. Framework-free so it's unit-testable without the
 * database or the Gemini SDK (Constitution Principle III).
 */

import type {
  ReviewFindingCategory,
  ReviewFindingArea,
  ReviewFindingSeverity,
} from "@/app/generated/prisma/client";

export type PersistedReviewFinding = {
  id: string;
  category: "gap" | "risk";
  area: "process_map" | "raci" | "authority" | "general";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  recommendation: string;
  status: "OPEN" | "EDITED" | "INTEGRATED" | "DISMISSED";
  integratedStepId: string | null;
  integratedStepLabel: string | null;
  integrationMode: "MERGED" | "REPLACED" | null;
};

/** Shapes a ReviewFinding row (with its integratedStep included) for the client. */
export function toPersistedFinding(f: {
  id: string;
  category: ReviewFindingCategory;
  area: ReviewFindingArea;
  severity: ReviewFindingSeverity;
  title: string;
  description: string;
  recommendation: string;
  status: string;
  integratedStepId: string | null;
  integrationMode: string | null;
  integratedStep: { label: string } | null;
}): PersistedReviewFinding {
  return {
    id: f.id,
    category: f.category.toLowerCase() as PersistedReviewFinding["category"],
    area: f.area.toLowerCase() as PersistedReviewFinding["area"],
    severity: f.severity.toLowerCase() as PersistedReviewFinding["severity"],
    title: f.title,
    description: f.description,
    recommendation: f.recommendation,
    status: f.status as PersistedReviewFinding["status"],
    integratedStepId: f.integratedStepId,
    integratedStepLabel: f.integratedStep?.label ?? null,
    integrationMode: f.integrationMode as PersistedReviewFinding["integrationMode"],
  };
}

/** Case/whitespace-insensitive key so near-identical AI wording still matches. */
export function normalizeFindingTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Filters a fresh AI review result down to genuinely new findings: not a
 * title the user already dismissed on this process, and not one already
 * being tracked (open/edited/integrated) so re-running doesn't duplicate it.
 */
export function partitionNewFindings<T extends { title: string }>(
  rawFindings: T[],
  dismissedTitles: ReadonlySet<string>,
  trackedTitles: ReadonlySet<string>
): T[] {
  return rawFindings.filter((f) => {
    const key = normalizeFindingTitle(f.title);
    return !dismissedTitles.has(key) && !trackedTitles.has(key);
  });
}

/** Appends a new review note to a step's existing notes, blank-safe. */
export function appendReviewNote(existing: string | null, note: string): string {
  const trimmedNote = note.trim();
  if (!existing || !existing.trim()) return trimmedNote;
  return `${existing.trim()}\n\n${trimmedNote}`;
}
