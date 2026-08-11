/**
 * Process Map connection rules (spec FR-003; Edge Cases: cycles/rework loops are
 * explicitly permitted). Pure and framework-free (Constitution Principle III).
 */

export type StepConnectionInput = { fromStepId: string; toStepId: string };

export type ProcessGraphIssue =
  | { type: "CROSS_PROCESS_CONNECTION"; fromStepId: string; toStepId: string }
  | { type: "UNKNOWN_STEP"; fromStepId: string; toStepId: string };

/**
 * Validates that every connection joins two steps belonging to the same
 * Process. Cycles are intentionally NOT flagged — rework loops are valid
 * process behavior per the spec's Edge Cases.
 */
export function validateConnections(
  connections: StepConnectionInput[],
  stepProcessId: Map<string, string>
): ProcessGraphIssue[] {
  const issues: ProcessGraphIssue[] = [];

  for (const conn of connections) {
    const fromProcess = stepProcessId.get(conn.fromStepId);
    const toProcess = stepProcessId.get(conn.toStepId);

    if (!fromProcess || !toProcess) {
      issues.push({ type: "UNKNOWN_STEP", fromStepId: conn.fromStepId, toStepId: conn.toStepId });
      continue;
    }

    if (fromProcess !== toProcess) {
      issues.push({
        type: "CROSS_PROCESS_CONNECTION",
        fromStepId: conn.fromStepId,
        toStepId: conn.toStepId,
      });
    }
  }

  return issues;
}
