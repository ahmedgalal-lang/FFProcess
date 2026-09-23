import "dotenv/config";
import { Client } from "pg";

/**
 * A minimal process for exercising the decision branch editor (spec 014):
 * Start → Check budget (Task) → End. Deliberately small and disposable —
 * the tests add their own Decision step and branches on top of this, so a
 * dedicated fixture keeps that from touching PUR101 (which other specs,
 * e.g. core-workflows.spec.ts, assert exact step positions against).
 *
 * Raw SQL rather than Prisma, like every other fixture here: Playwright
 * cannot import the generated client, which is ESM.
 */
export const DECISION_PROCESS_ID = "decision-branch-process-fixture";
export const DECISION_PROCESS_CODE = "TES500";
const WORKSPACE_ID = "workspace-acme";
const ROLE_ID = "decision-branch-process-role";

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function removeDecisionBranchProcess(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`DELETE FROM step_connections WHERE "processId" = $1`, [DECISION_PROCESS_ID]);
    await c.query(`DELETE FROM process_steps WHERE "processId" = $1`, [DECISION_PROCESS_ID]);
    await c.query(`DELETE FROM processes WHERE id = $1`, [DECISION_PROCESS_ID]);
    await c.query(`DELETE FROM roles WHERE id = $1`, [ROLE_ID]);
  });
}

export async function makeDecisionBranchProcess(): Promise<{ id: string; code: string }> {
  await removeDecisionBranchProcess();

  await withClient(async (c) => {
    await c.query(`INSERT INTO roles (id, "workspaceId", name) VALUES ($1, $2, 'Approver')`, [
      ROLE_ID,
      WORKSPACE_ID,
    ]);

    await c.query(
      `INSERT INTO processes (id, "workspaceId", code, name, description, "processPurpose",
                              "raciVisibleRoleIds", "inScope", "outOfScope", "externalEntities", kpis,
                              "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, '{}', '{}', '{}', '[]', '[]', now(), now())`,
      [
        DECISION_PROCESS_ID,
        WORKSPACE_ID,
        DECISION_PROCESS_CODE,
        "Decision branch fixture",
        "A minimal process for testing the decision branch editor.",
        "Exercises adding and editing a Decision step's Yes/No branches.",
      ]
    );

    const steps: { id: string; type: string; label: string; order: number }[] = [
      { id: `${DECISION_PROCESS_ID}-start`, type: "START", label: "Start", order: 1 },
      { id: `${DECISION_PROCESS_ID}-check-budget`, type: "TASK", label: "Check budget", order: 2 },
      { id: `${DECISION_PROCESS_ID}-end`, type: "END", label: "End", order: 3 },
    ];
    for (const [i, step] of steps.entries()) {
      await c.query(
        `INSERT INTO process_steps (id, "processId", type, label, "order", "positionX", "positionY",
                                    "detailedAction", milestone, "assignedRoleId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, '{}', false, $7, now())`,
        [step.id, DECISION_PROCESS_ID, step.type, step.label, step.order, 210 + i * 262, ROLE_ID]
      );
    }
    await c.query(
      `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
       VALUES ($1, $2, $3, $4, NULL)`,
      [`${DECISION_PROCESS_ID}-conn-1`, DECISION_PROCESS_ID, steps[0]!.id, steps[1]!.id]
    );
    await c.query(
      `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
       VALUES ($1, $2, $3, $4, NULL)`,
      [`${DECISION_PROCESS_ID}-conn-2`, DECISION_PROCESS_ID, steps[1]!.id, steps[2]!.id]
    );
  });

  return { id: DECISION_PROCESS_ID, code: DECISION_PROCESS_CODE };
}
