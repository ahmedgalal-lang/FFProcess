import "dotenv/config";
import { Client } from "pg";

/**
 * A process whose steps have been arranged by hand, so where they sit on the
 * canvas has nothing to do with the order they run in.
 *
 * Every other fixture lays its steps out left to right in step order, which
 * is what the auto-layout does when you add them one after another. But the
 * interactive map is a drag-and-drop editor and invites exactly this: a
 * consultant moves a step to sit near the others it relates to, and the
 * stored x no longer tells you anything about sequence.
 *
 * Sixteen steps whose x positions are deliberately shuffled against their
 * order, which is what a real hand-arranged map looks like.
 *
 * Raw SQL rather than Prisma, like every other fixture here: Playwright
 * cannot import the generated client, which is ESM.
 */
export const ARRANGED_PROCESS_ID = "arranged-process-fixture";
export const ARRANGED_PROCESS_CODE = "TES500";
const WORKSPACE_ID = "workspace-acme";

/**
 * Step order 1..16, each with the column a consultant dragged it to. The
 * column order is a shuffle of the step order — no step but the first sits
 * where its number would put it.
 */
const COLUMN_FOR_STEP = [9, 0, 1, 2, 4, 3, 10, 8, 11, 12, 15, 13, 7, 6, 5, 14];

const ROLES = ["PM", "Consultant", "QS", "Procurement", "Construction"] as const;

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function removeArrangedProcess(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`DELETE FROM step_connections WHERE "processId" = $1`, [ARRANGED_PROCESS_ID]);
    await c.query(`DELETE FROM process_steps WHERE "processId" = $1`, [ARRANGED_PROCESS_ID]);
    await c.query(`DELETE FROM processes WHERE id = $1`, [ARRANGED_PROCESS_ID]);
    await c.query(`DELETE FROM roles WHERE "workspaceId" = $1 AND id LIKE $2`, [
      WORKSPACE_ID,
      "arranged-role-%",
    ]);
  });
}

export async function makeArrangedProcess(): Promise<{ id: string; stepCount: number }> {
  await removeArrangedProcess();

  await withClient(async (c) => {
    const roleId: Record<string, string> = {};
    for (const [i, name] of ROLES.entries()) {
      const id = `arranged-role-${i}`;
      await c.query(`INSERT INTO roles (id, "workspaceId", name) VALUES ($1, $2, $3)`, [
        id,
        WORKSPACE_ID,
        name,
      ]);
      roleId[name] = id;
    }

    await c.query(
      `INSERT INTO processes (id, "workspaceId", code, name, description, "processPurpose",
                              "raciVisibleRoleIds", "inScope", "outOfScope", "externalEntities", kpis,
                              "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, '{}', '{}', '{}', '[]', '[]', now(), now())`,
      [
        ARRANGED_PROCESS_ID,
        WORKSPACE_ID,
        ARRANGED_PROCESS_CODE,
        "Hand-arranged tender",
        "A process whose steps were dragged into place, so x order is not step order.",
        "Exercises the printed map on a process a consultant arranged by hand.",
      ]
    );

    for (const [i, column] of COLUMN_FOR_STEP.entries()) {
      await c.query(
        `INSERT INTO process_steps (id, "processId", type, label, "order", "positionX", "positionY",
                                    "detailedAction", milestone, "assignedRoleId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, '{}', false, $7, now())`,
        [
          `${ARRANGED_PROCESS_ID}-step-${i + 1}`,
          ARRANGED_PROCESS_ID,
          i === 0 ? "START" : i === COLUMN_FOR_STEP.length - 1 ? "END" : i % 5 === 2 ? "DECISION" : "TASK",
          `Step ${i + 1}`,
          i + 1,
          210 + column * 262,
          roleId[ROLES[i % ROLES.length]!]!,
        ]
      );
    }

    // A plain chain: step n to step n + 1, in order. On a map dealt into rows
    // by step order these are nearly all short hops; dealt by x position they
    // scatter across rows and each one needs a marked pair.
    for (let i = 0; i < COLUMN_FOR_STEP.length - 1; i++) {
      await c.query(
        `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
         VALUES ($1, $2, $3, $4, NULL)`,
        [
          `${ARRANGED_PROCESS_ID}-conn-${i + 1}`,
          ARRANGED_PROCESS_ID,
          `${ARRANGED_PROCESS_ID}-step-${i + 1}`,
          `${ARRANGED_PROCESS_ID}-step-${i + 2}`,
        ]
      );
    }
  });

  return { id: ARRANGED_PROCESS_ID, stepCount: COLUMN_FOR_STEP.length };
}
