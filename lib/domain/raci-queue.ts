/**
 * Partitions a Process Map's steps into the RACI "hand-off" queue: steps
 * still needing an assign-or-skip decision, and steps already explicitly
 * skipped. A step with a linked Activity (relatedStepId) is neither — it's
 * already handled and shows up in the RACI grid itself. Pure and
 * framework-free (Constitution Principle III).
 */

export type QueueStep = { id: string; type: "START" | "TASK" | "DECISION" | "END"; label: string; raciSkipped: boolean };

export type RaciQueue = {
  pending: QueueStep[];
  skipped: QueueStep[];
};

export function partitionRaciQueue(steps: QueueStep[], stepIdsWithActivity: Set<string>): RaciQueue {
  const pending: QueueStep[] = [];
  const skipped: QueueStep[] = [];

  for (const step of steps) {
    if (stepIdsWithActivity.has(step.id)) continue;
    if (step.raciSkipped) skipped.push(step);
    else pending.push(step);
  }

  return { pending, skipped };
}
