import "dotenv/config";
import { Client } from "pg";

/**
 * A process with a genuine parallel pair for exercising parallel step
 * numbering (spec 016): Start → Legal sign-off (Task) and Start → Client
 * sign-off (Task), both → Countersign (Task) → End, with Countersign's
 * "requires all" rule on and its two predecessors genuinely unreachable
 * from one another — the minimal shape every test in this feature needs.
 *
 * Raw SQL rather than Prisma, like every other fixture here: Playwright
 * cannot import the generated client, which is ESM.
 */
export const PARALLEL_PROCESS_ID = "parallel-step-process-fixture";
export const PARALLEL_PROCESS_CODE = "TES700";
const WORKSPACE_ID = "workspace-acme";
const ROLE_ID = "parallel-step-process-role";

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function removeParallelStepProcess(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`DELETE FROM step_connections WHERE "processId" = $1`, [PARALLEL_PROCESS_ID]);
    await c.query(`DELETE FROM process_steps WHERE "processId" = $1`, [PARALLEL_PROCESS_ID]);
    await c.query(`DELETE FROM processes WHERE id = $1`, [PARALLEL_PROCESS_ID]);
    await c.query(`DELETE FROM roles WHERE id = $1`, [ROLE_ID]);
  });
}

export async function makeParallelStepProcess(): Promise<{ id: string; code: string }> {
  await removeParallelStepProcess();

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
        PARALLEL_PROCESS_ID,
        WORKSPACE_ID,
        PARALLEL_PROCESS_CODE,
        "Parallel step fixture",
        "A minimal process for testing parallel step numbering.",
        "Exercises a genuine parallel pair feeding a requires-all step.",
      ]
    );

    const steps: { id: string; type: string; label: string; order: number; joinRequiresAll: boolean }[] = [
      { id: `${PARALLEL_PROCESS_ID}-start`, type: "START", label: "Start", order: 1, joinRequiresAll: false },
      { id: `${PARALLEL_PROCESS_ID}-legal`, type: "TASK", label: "Legal sign-off", order: 2, joinRequiresAll: false },
      { id: `${PARALLEL_PROCESS_ID}-client`, type: "TASK", label: "Client sign-off", order: 3, joinRequiresAll: false },
      { id: `${PARALLEL_PROCESS_ID}-countersign`, type: "TASK", label: "Countersign", order: 4, joinRequiresAll: true },
      { id: `${PARALLEL_PROCESS_ID}-end`, type: "END", label: "End", order: 5, joinRequiresAll: false },
    ];
    for (const [i, step] of steps.entries()) {
      await c.query(
        `INSERT INTO process_steps (id, "processId", type, label, "order", "positionX", "positionY",
                                    "detailedAction", milestone, "joinRequiresAll", "assignedRoleId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, '{}', false, $7, $8, now())`,
        [step.id, PARALLEL_PROCESS_ID, step.type, step.label, step.order, 210 + i * 262, step.joinRequiresAll, ROLE_ID]
      );
    }
    // Start -> Legal sign-off, Start -> Client sign-off, both -> Countersign -> End.
    const connections: [string, string][] = [
      [steps[0]!.id, steps[1]!.id],
      [steps[0]!.id, steps[2]!.id],
      [steps[1]!.id, steps[3]!.id],
      [steps[2]!.id, steps[3]!.id],
      [steps[3]!.id, steps[4]!.id],
    ];
    for (const [i, [from, to]] of connections.entries()) {
      await c.query(
        `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
         VALUES ($1, $2, $3, $4, NULL)`,
        [`${PARALLEL_PROCESS_ID}-conn-${i}`, PARALLEL_PROCESS_ID, from, to]
      );
    }
  });

  return { id: PARALLEL_PROCESS_ID, code: PARALLEL_PROCESS_CODE };
}

/** Connects Legal sign-off directly to Client sign-off — a real chain, no longer parallel. */
export async function connectLegalToClient(): Promise<void> {
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [
        `${PARALLEL_PROCESS_ID}-conn-legal-client`,
        PARALLEL_PROCESS_ID,
        `${PARALLEL_PROCESS_ID}-legal`,
        `${PARALLEL_PROCESS_ID}-client`,
      ]
    );
  });
}
