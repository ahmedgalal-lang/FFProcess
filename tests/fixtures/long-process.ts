import "dotenv/config";
import { Client } from "pg";

/**
 * A process long enough that its map has to wrap, for the end-to-end spec and
 * for looking at by hand.
 *
 * Every seeded process is nine steps or fewer, so nothing in the fixtures
 * exercises the wrap. This builds one that exercises all of it at once: more
 * steps than fit a row, three roles plus a roleless step so the per-row lanes
 * have something to do, and a labelled branch that crosses a row boundary.
 *
 * Raw SQL rather than Prisma, like every other fixture here: Playwright cannot
 * import the generated client, which is ESM.
 */
export const LONG_PROCESS_ID = "long-process-fixture";
export const LONG_PROCESS_CODE = "TES100";
const WORKSPACE_ID = "workspace-acme";

/** Laid out as the interactive map lays steps out — the wrap reads this order. */
const FIRST_STEP_X = 210;
const STEP_X_SPACING = 262;

const STEPS: { label: string; role: "ap" | "fin" | "pro" | null; decision?: true }[] = [
  { label: "RFQ received", role: "ap" },
  { label: "Evaluate the opportunity", role: "pro", decision: true },
  { label: "Route to sector owner", role: "pro" },
  { label: "Site visit & technical clarification", role: "pro" },
  { label: "Cross-functional alignment", role: "fin" },
  { label: "Costing proposal", role: "fin" },
  { label: "CEO scenario review", role: "fin", decision: true },
  { label: "Board meeting", role: null },
  { label: "Internal final review", role: "fin" },
  { label: "Client negotiation", role: "pro" },
  { label: "Contract drafting", role: "ap" },
  { label: "Legal review", role: null },
  { label: "Signature", role: "ap" },
  { label: "Handover to delivery", role: "pro" },
  { label: "Mobilisation", role: "pro" },
  { label: "Kick-off", role: "pro" },
  { label: "Execution", role: "fin" },
  { label: "Progress reporting", role: "fin" },
  { label: "Change control", role: "fin", decision: true },
  { label: "Acceptance", role: "ap" },
  { label: "Final invoice", role: "ap" },
  { label: "Close-out", role: "ap" },
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

export async function removeLongProcess(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`DELETE FROM step_connections WHERE "processId" = $1`, [LONG_PROCESS_ID]);
    await c.query(`DELETE FROM process_steps WHERE "processId" = $1`, [LONG_PROCESS_ID]);
    await c.query(`DELETE FROM processes WHERE id = $1`, [LONG_PROCESS_ID]);
  });
}

export async function makeLongProcess(): Promise<{ id: string; code: string; stepCount: number }> {
  await removeLongProcess();

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
        LONG_PROCESS_ID,
        WORKSPACE_ID,
        LONG_PROCESS_CODE,
        "End to end high-level",
        "A process long enough that its map has to wrap onto several rows.",
        "Exercises the wrapped process map: more steps than fit a row, several lanes, and a labelled branch that crosses a row boundary.",
      ]
    );

    for (const [i, step] of STEPS.entries()) {
      await c.query(
        `INSERT INTO process_steps (id, "processId", type, label, "order", "positionX", "positionY",
                                    "detailedAction", milestone, "assignedRoleId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, '{}', $7, $8, now())`,
        [
          `${LONG_PROCESS_ID}-step-${i + 1}`,
          LONG_PROCESS_ID,
          i === 0 ? "START" : i === STEPS.length - 1 ? "END" : step.decision ? "DECISION" : "TASK",
          step.label,
          i + 1,
          FIRST_STEP_X + i * STEP_X_SPACING,
          i % 2 === 0,
          step.role ? roleIds[step.role] : null,
        ]
      );
    }

    // A straight chain, plus one labelled branch that skips ahead far enough to
    // land on a different row whatever the capacity turns out to be — and by
    // more than one row, which is the part that matters. A connection landing
    // in the very next row at the same column is a *seam*: the serpentine
    // layout puts those two steps directly above one another, so it is drawn
    // as a short vertical drop rather than broken into a marked pair. Step 7
    // to step 14 was exactly that at one capacity and not at another, so the
    // fixture silently stopped exercising cross-row markers when the column
    // spacing changed. Three rows ahead can never be a seam.
    for (let i = 0; i < STEPS.length - 1; i++) {
      await c.query(
        `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
         VALUES ($1, $2, $3, $4, NULL)`,
        [
          `${LONG_PROCESS_ID}-conn-${i + 1}`,
          LONG_PROCESS_ID,
          `${LONG_PROCESS_ID}-step-${i + 1}`,
          `${LONG_PROCESS_ID}-step-${i + 2}`,
        ]
      );
    }
    await c.query(
      `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
       VALUES ($1, $2, $3, $4, 'Escalate')`,
      [
        `${LONG_PROCESS_ID}-conn-branch`,
        LONG_PROCESS_ID,
        `${LONG_PROCESS_ID}-step-7`,
        `${LONG_PROCESS_ID}-step-20`,
      ]
    );
  });

  return { id: LONG_PROCESS_ID, code: LONG_PROCESS_CODE, stepCount: STEPS.length };
}

export const SHORT_PROCESS_ID = "short-process-fixture";

/**
 * A process short enough that its map must not wrap.
 *
 * Needed because the compact print card fits six steps to a row, and every
 * seeded process except the empty ones has more than six — so nothing seeded
 * can prove the "leave a short process alone" half of the behaviour.
 */
export async function makeShortProcess(): Promise<{ id: string; stepCount: number }> {
  await removeShortProcess();
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO processes (id, "workspaceId", code, name, "raciVisibleRoleIds", "inScope",
                              "outOfScope", "externalEntities", kpis, "createdAt", "updatedAt")
       VALUES ($1, $2, 'TES200', 'Short enough not to wrap', '{}', '{}', '{}', '[]', '[]', now(), now())`,
      [SHORT_PROCESS_ID, WORKSPACE_ID]
    );
    for (let i = 0; i < 4; i++) {
      await c.query(
        `INSERT INTO process_steps (id, "processId", type, label, "order", "positionX", "positionY",
                                    "detailedAction", milestone, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, '{}', false, now())`,
        [
          `${SHORT_PROCESS_ID}-step-${i + 1}`,
          SHORT_PROCESS_ID,
          i === 0 ? "START" : i === 3 ? "END" : "TASK",
          `Step ${i + 1}`,
          i + 1,
          FIRST_STEP_X + i * STEP_X_SPACING,
        ]
      );
    }
  });
  return { id: SHORT_PROCESS_ID, stepCount: 4 };
}

export async function removeShortProcess(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`DELETE FROM step_connections WHERE "processId" = $1`, [SHORT_PROCESS_ID]);
    await c.query(`DELETE FROM process_steps WHERE "processId" = $1`, [SHORT_PROCESS_ID]);
    await c.query(`DELETE FROM processes WHERE id = $1`, [SHORT_PROCESS_ID]);
  });
}
