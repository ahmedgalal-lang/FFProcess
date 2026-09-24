import "dotenv/config";
import { Client } from "pg";

/**
 * A small process with a real two-predecessor convergence, for exercising
 * the step join requirement (spec 015): Start → Legal sign-off (Task) → End,
 * and Start → Client sign-off (Task) → End — so "End" already has two
 * incoming connections before any test touches it, matching the Independent
 * Test's own premise ("a step with two connections already leading into it,
 * created some other way").
 *
 * Raw SQL rather than Prisma, like every other fixture here: Playwright
 * cannot import the generated client, which is ESM.
 */
export const JOIN_PROCESS_ID = "step-join-process-fixture";
export const JOIN_PROCESS_CODE = "TES600";
const WORKSPACE_ID = "workspace-acme";
const ROLE_ID = "step-join-process-role";

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function removeStepJoinProcess(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`DELETE FROM step_connections WHERE "processId" = $1`, [JOIN_PROCESS_ID]);
    await c.query(`DELETE FROM process_steps WHERE "processId" = $1`, [JOIN_PROCESS_ID]);
    await c.query(`DELETE FROM processes WHERE id = $1`, [JOIN_PROCESS_ID]);
    await c.query(`DELETE FROM roles WHERE id = $1`, [ROLE_ID]);
  });
}

export async function makeStepJoinProcess(): Promise<{ id: string; code: string }> {
  await removeStepJoinProcess();

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
        JOIN_PROCESS_ID,
        WORKSPACE_ID,
        JOIN_PROCESS_CODE,
        "Step join fixture",
        "A minimal process for testing the step join requirement.",
        "Exercises a step with two predecessors and its arrival rule.",
      ]
    );

    const steps: { id: string; type: string; label: string; order: number }[] = [
      { id: `${JOIN_PROCESS_ID}-start`, type: "START", label: "Start", order: 1 },
      { id: `${JOIN_PROCESS_ID}-legal`, type: "TASK", label: "Legal sign-off", order: 2 },
      { id: `${JOIN_PROCESS_ID}-client`, type: "TASK", label: "Client sign-off", order: 3 },
      { id: `${JOIN_PROCESS_ID}-end`, type: "END", label: "End", order: 4 },
    ];
    for (const [i, step] of steps.entries()) {
      await c.query(
        `INSERT INTO process_steps (id, "processId", type, label, "order", "positionX", "positionY",
                                    "detailedAction", milestone, "joinRequiresAll", "assignedRoleId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, '{}', false, false, $7, now())`,
        [step.id, JOIN_PROCESS_ID, step.type, step.label, step.order, 210 + i * 262, ROLE_ID]
      );
    }
    // Start -> Legal sign-off, Start -> Client sign-off, both -> End.
    await c.query(
      `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
       VALUES ($1, $2, $3, $4, NULL)`,
      [`${JOIN_PROCESS_ID}-conn-start-legal`, JOIN_PROCESS_ID, steps[0]!.id, steps[1]!.id]
    );
    await c.query(
      `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
       VALUES ($1, $2, $3, $4, NULL)`,
      [`${JOIN_PROCESS_ID}-conn-start-client`, JOIN_PROCESS_ID, steps[0]!.id, steps[2]!.id]
    );
    await c.query(
      `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
       VALUES ($1, $2, $3, $4, NULL)`,
      [`${JOIN_PROCESS_ID}-conn-legal-end`, JOIN_PROCESS_ID, steps[1]!.id, steps[3]!.id]
    );
    await c.query(
      `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
       VALUES ($1, $2, $3, $4, NULL)`,
      [`${JOIN_PROCESS_ID}-conn-client-end`, JOIN_PROCESS_ID, steps[2]!.id, steps[3]!.id]
    );
  });

  return { id: JOIN_PROCESS_ID, code: JOIN_PROCESS_CODE };
}
