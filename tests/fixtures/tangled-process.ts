import "dotenv/config";
import { Client } from "pg";

/**
 * A process whose connectors tangle under the map's old drawing.
 *
 * The other fixtures are chains: step n to step n+1, with at most one branch.
 * A chain cannot show the defect this fixture exists for, because two
 * neighbours are drawn as a short straight line whatever the router does.
 * What tangles a map is connectors that skip columns, loop back, and share an
 * endpoint — several leaving one card, several arriving at another.
 *
 * Ten steps over three roles, then eight connectors chosen so that under the
 * old fixed-elbow drawing they overlap each other and cross cards they have
 * nothing to do with. Ten is deliberately short enough that the live canvas
 * draws it unwrapped, so the routing is what is being measured and not the
 * wrap.
 *
 * Raw SQL rather than Prisma, like every other fixture here: Playwright cannot
 * import the generated client, which is ESM.
 */
export const TANGLED_PROCESS_ID = "tangled-process-fixture";
export const TANGLED_PROCESS_CODE = "TES300";
const WORKSPACE_ID = "workspace-acme";

const FIRST_STEP_X = 210;
const STEP_X_SPACING = 262;

const STEPS: { label: string; role: "ap" | "fin" | "pro" | null; decision?: true }[] = [
  { label: "Request raised", role: "ap" },
  { label: "Scope review", role: "pro" },
  { label: "Cost estimate", role: "fin" },
  { label: "Design package", role: "pro" },
  { label: "Budget check", role: "fin", decision: true },
  { label: "Contracting", role: "ap" },
  { label: "Tender package", role: "pro" },
  { label: "Award decision", role: "fin", decision: true },
  { label: "Mobilisation", role: "pro" },
  { label: "Closed", role: "ap" },
];

/**
 * Eight connectors. The five in the chain are ordinary; the three after it are
 * the ones that made the old map unreadable.
 */
const CONNECTIONS: { from: number; to: number; label?: string }[] = [
  { from: 1, to: 2 },
  { from: 2, to: 3 },
  { from: 3, to: 4 },
  { from: 4, to: 5 },
  { from: 5, to: 6 },
  { from: 6, to: 7 },
  { from: 7, to: 8 },
  { from: 8, to: 9 },
  { from: 9, to: 10 },
  // Skips five columns, from a card that already has an outgoing connector —
  // so two connectors leave step 2, and the long one has a long way to travel.
  { from: 2, to: 7, label: "Fast track" },
  // A second long jump in the same direction, overlapping the first's span.
  // Under the old drawing these two shared a line for most of their length.
  { from: 3, to: 8 },
  // Loops back across four columns. Runs against the flow, so it is drawn
  // amber and dashed, and under the old drawing it went through three cards.
  { from: 8, to: 3, label: "Rework" },
  // A third arrival at step 8, so the approach side has to separate as well.
  { from: 5, to: 8 },
];

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function removeTangledProcess(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`DELETE FROM step_connections WHERE "processId" = $1`, [TANGLED_PROCESS_ID]);
    await c.query(`DELETE FROM process_steps WHERE "processId" = $1`, [TANGLED_PROCESS_ID]);
    await c.query(`DELETE FROM processes WHERE id = $1`, [TANGLED_PROCESS_ID]);
  });
}

export async function makeTangledProcess(): Promise<{ id: string; code: string; stepCount: number; connectionCount: number }> {
  await removeTangledProcess();

  await withClient(async (c) => {
    const { rows: roles } = await c.query<{ id: string; name: string }>(
      `SELECT id, name FROM roles WHERE "workspaceId" = $1`,
      [WORKSPACE_ID]
    );
    const byName = (needle: string) =>
      roles.find((r) => r.name.toLowerCase().includes(needle))?.id ?? null;
    const roleIds = { ap: byName("ap clerk"), fin: byName("finance"), pro: byName("procurement") };

    await c.query(
      `INSERT INTO processes (id, "workspaceId", code, name, description, "processPurpose",
                              "raciVisibleRoleIds", "inScope", "outOfScope", "externalEntities", kpis,
                              "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, '{}', '{}', '{}', '[]', '[]', now(), now())`,
      [
        TANGLED_PROCESS_ID,
        WORKSPACE_ID,
        TANGLED_PROCESS_CODE,
        "Tangled connectors",
        "Skipping and looping connectors, for measuring how the map routes them.",
        "Exercises connector routing: connectors that skip columns, loop back, and share an endpoint.",
      ]
    );

    for (const [i, step] of STEPS.entries()) {
      await c.query(
        `INSERT INTO process_steps (id, "processId", type, label, "order", "positionX", "positionY",
                                    "detailedAction", milestone, "assignedRoleId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, '{}', false, $7, now())`,
        [
          `${TANGLED_PROCESS_ID}-step-${i + 1}`,
          TANGLED_PROCESS_ID,
          i === 0 ? "START" : i === STEPS.length - 1 ? "END" : step.decision ? "DECISION" : "TASK",
          step.label,
          i + 1,
          FIRST_STEP_X + i * STEP_X_SPACING,
          step.role ? roleIds[step.role] : null,
        ]
      );
    }

    for (const [i, conn] of CONNECTIONS.entries()) {
      await c.query(
        `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `${TANGLED_PROCESS_ID}-conn-${i + 1}`,
          TANGLED_PROCESS_ID,
          `${TANGLED_PROCESS_ID}-step-${conn.from}`,
          `${TANGLED_PROCESS_ID}-step-${conn.to}`,
          conn.label ?? null,
        ]
      );
    }
  });

  return {
    id: TANGLED_PROCESS_ID,
    code: TANGLED_PROCESS_CODE,
    stepCount: STEPS.length,
    connectionCount: CONNECTIONS.length,
  };
}
