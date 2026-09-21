import "dotenv/config";
import { Client } from "pg";

/**
 * A process shaped like the ones consultants actually build: twenty-five
 * steps over six roles, so the map wraps onto several rows *and* each row
 * carries a stack of lanes.
 *
 * The other fixtures are narrow — three roles and a chain — which is why
 * nothing caught how a six-lane process prints. A row of a six-lane map is
 * mostly empty: six lanes by seven columns is forty-two places for seven
 * cards, and everything about how tall a row is and which lanes it draws
 * only starts to matter at that shape.
 *
 * Raw SQL rather than Prisma, like every other fixture here: Playwright
 * cannot import the generated client, which is ESM.
 */
export const WIDE_PROCESS_ID = "wide-process-fixture";
export const WIDE_PROCESS_CODE = "TES400";
const WORKSPACE_ID = "workspace-acme";

const FIRST_STEP_X = 210;
const STEP_X_SPACING = 262;

/** The roles this fixture needs, created if the workspace has not got them. */
const ROLES = [
  "PM",
  "Design House",
  "QS",
  "Procurement",
  "Consultant",
  "Construction",
] as const;
type RoleName = (typeof ROLES)[number];

const STEPS: { label: string; role: RoleName; decision?: true }[] = [
  { label: "Brief received", role: "PM" },
  { label: "Appoint design house", role: "Procurement" },
  { label: "Site survey", role: "Consultant" },
  { label: "Concept masterplan", role: "Design House" },
  { label: "Cost plan", role: "QS" },
  { label: "Concept review", role: "PM", decision: true },
  { label: "Client presentation", role: "PM" },
  { label: "Comments log", role: "Consultant" },
  { label: "Revise concept", role: "Design House" },
  { label: "Budget alignment", role: "QS" },
  { label: "Renders updated masterplan", role: "Design House" },
  { label: "Sourcing stage", role: "Procurement" },
  { label: "Review the plan & R1", role: "QS", decision: true },
  { label: "Review the masterplan", role: "Consultant" },
  { label: "Report creation", role: "Construction" },
  { label: "Sample schematic design", role: "Design House" },
  { label: "Approve the sample", role: "PM" },
  { label: "Schematic package", role: "Design House" },
  { label: "Review", role: "PM", decision: true },
  { label: "Tender documents", role: "QS" },
  { label: "Contractor shortlist", role: "Procurement" },
  { label: "Site mobilisation", role: "Construction" },
  { label: "Construction issue set", role: "Design House" },
  { label: "Snagging", role: "Construction" },
  { label: "Handover", role: "PM" },
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

export async function removeWideProcess(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`DELETE FROM step_connections WHERE "processId" = $1`, [WIDE_PROCESS_ID]);
    await c.query(`DELETE FROM process_steps WHERE "processId" = $1`, [WIDE_PROCESS_ID]);
    await c.query(`DELETE FROM processes WHERE id = $1`, [WIDE_PROCESS_ID]);
    await c.query(`DELETE FROM roles WHERE "workspaceId" = $1 AND id LIKE $2`, [
      WORKSPACE_ID,
      "wide-process-role-%",
    ]);
  });
}

export async function makeWideProcess(): Promise<{ id: string; code: string; stepCount: number }> {
  await removeWideProcess();

  await withClient(async (c) => {
    // Roles of this fixture's own, removed again afterwards, so it never
    // borrows or disturbs the ones the seed put in the workspace.
    const roleId: Record<string, string> = {};
    for (const [i, name] of ROLES.entries()) {
      const id = `wide-process-role-${i}`;
      await c.query(
        `INSERT INTO roles (id, "workspaceId", name) VALUES ($1, $2, $3)`,
        [id, WORKSPACE_ID, name]
      );
      roleId[name] = id;
    }

    await c.query(
      `INSERT INTO processes (id, "workspaceId", code, name, description, "processPurpose",
                              "raciVisibleRoleIds", "inScope", "outOfScope", "externalEntities", kpis,
                              "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, '{}', '{}', '{}', '[]', '[]', now(), now())`,
      [
        WIDE_PROCESS_ID,
        WORKSPACE_ID,
        WIDE_PROCESS_CODE,
        "Design and build",
        "Twenty-five steps over six roles — the shape a real engagement produces.",
        "Exercises a map that has to wrap onto several rows and stack six lanes in each of them.",
      ]
    );

    for (const [i, step] of STEPS.entries()) {
      await c.query(
        `INSERT INTO process_steps (id, "processId", type, label, "order", "positionX", "positionY",
                                    "detailedAction", milestone, "assignedRoleId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, '{}', false, $7, now())`,
        [
          `${WIDE_PROCESS_ID}-step-${i + 1}`,
          WIDE_PROCESS_ID,
          i === 0 ? "START" : i === STEPS.length - 1 ? "END" : step.decision ? "DECISION" : "TASK",
          step.label,
          i + 1,
          FIRST_STEP_X + i * STEP_X_SPACING,
          roleId[step.role]!,
        ]
      );
    }

    for (let i = 0; i < STEPS.length - 1; i++) {
      await c.query(
        `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
         VALUES ($1, $2, $3, $4, NULL)`,
        [
          `${WIDE_PROCESS_ID}-conn-${i + 1}`,
          WIDE_PROCESS_ID,
          `${WIDE_PROCESS_ID}-step-${i + 1}`,
          `${WIDE_PROCESS_ID}-step-${i + 2}`,
        ]
      );
    }
    // One rejection loop, as every real review step has.
    await c.query(
      `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
       VALUES ($1, $2, $3, $4, 'Rejected')`,
      [
        `${WIDE_PROCESS_ID}-conn-loop`,
        WIDE_PROCESS_ID,
        `${WIDE_PROCESS_ID}-step-19`,
        `${WIDE_PROCESS_ID}-step-16`,
      ]
    );
  });

  return { id: WIDE_PROCESS_ID, code: WIDE_PROCESS_CODE, stepCount: STEPS.length };
}
