import "dotenv/config";
import { Client } from "pg";

/**
 * The shape that broke the printed map, rebuilt as a fixture: eighteen steps,
 * four roles, two decisions that each fork, a rejection branch that skips a
 * card, and labels long enough to overflow a compact print card.
 *
 * Taken from a real tender process a consultant reported as unreadable — the
 * row labels landing in the middle of a connector, a "Yes" branch sweeping the
 * full width of the page under an unrelated card, two cards clipped by the
 * bottom of their own row, and a cross-row marker borrowing the label of a
 * different connection. Nothing in the other fixtures produces that
 * combination: long-process is a chain across three roles, wide-process is a
 * chain across six. This one forks.
 *
 * Raw SQL rather than Prisma, like every other fixture here: Playwright cannot
 * import the generated client, which is ESM.
 */
export const TENDER_PROCESS_ID = "tender-process-fixture";
export const TENDER_PROCESS_CODE = "TEN500";
const WORKSPACE_ID = "workspace-acme";

const FIRST_STEP_X = 210;
const STEP_X_SPACING = 262;

const ROLES = ["CEO", "HEAD OF COMMERCIAL EXCELLENCE", "SECTOR OWNER", "LEGAL"] as const;
type RoleName = (typeof ROLES)[number];

type StepDef = {
  label: string;
  role: RoleName;
  decision?: true;
};

/**
 * Step 7's label is the one a consultant actually typed, parentheses and all —
 * it is what overflows the compact card, so it is kept verbatim rather than
 * tidied into something that happens to fit.
 */
const STEPS: StepDef[] = [
  { label: "RFQ", role: "CEO" },
  { label: "Evaluate the opportunity", role: "CEO", decision: true },
  { label: "Rejected - Notify the requester with the rejection", role: "CEO" },
  { label: "Accepted: CCO based on the SCOPE with the sector involved", role: "HEAD OF COMMERCIAL EXCELLENCE" },
  { label: "Technical clarification - overall evaluation", role: "HEAD OF COMMERCIAL EXCELLENCE" },
  { label: "Costing proposal - With targeted sector owner", role: "HEAD OF COMMERCIAL EXCELLENCE" },
  {
    label: "Internal resources evaluation and needs (e.g.; Hr, staffing, salaries, etc..)",
    role: "HEAD OF COMMERCIAL EXCELLENCE",
  },
  { label: "Internal Scenarios review", role: "HEAD OF COMMERCIAL EXCELLENCE" },
  { label: "Adjust and refine", role: "HEAD OF COMMERCIAL EXCELLENCE" },
  { label: "Call for a board meeting", role: "CEO" },
  { label: "Adjust and refine", role: "HEAD OF COMMERCIAL EXCELLENCE" },
  { label: "Internal final review", role: "CEO" },
  { label: "Negotiation with client", role: "HEAD OF COMMERCIAL EXCELLENCE" },
  { label: "Letter of award from the client", role: "HEAD OF COMMERCIAL EXCELLENCE", decision: true },
  { label: "Contract Drafting", role: "HEAD OF COMMERCIAL EXCELLENCE" },
  { label: 'Internationally - Outsourcing legal firm "', role: "LEGAL" },
  { label: "Sign contract - Ceramony", role: "HEAD OF COMMERCIAL EXCELLENCE" },
  { label: "Execution", role: "SECTOR OWNER" },
];

/**
 * The chain, plus the three connections that make this shape hard: the
 * decision at step 2 forking to a rejection and onward, and the decision at
 * step 14 forking into a local and an international path that converge again.
 */
const CONNECTIONS: { from: number; to: number; label?: string }[] = [
  { from: 1, to: 2 },
  { from: 2, to: 3, label: "No" },
  { from: 2, to: 4, label: "Yes" },
  { from: 4, to: 5 },
  { from: 5, to: 6 },
  { from: 6, to: 7 },
  { from: 7, to: 8 },
  { from: 8, to: 9 },
  { from: 9, to: 10 },
  { from: 10, to: 11 },
  { from: 11, to: 12 },
  { from: 12, to: 13 },
  { from: 13, to: 14 },
  { from: 14, to: 15, label: "Locally" },
  { from: 14, to: 16, label: "Internationally" },
  { from: 15, to: 17 },
  { from: 16, to: 17 },
  { from: 17, to: 18 },
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

export async function removeTenderProcess(): Promise<void> {
  await withClient(async (c) => {
    await c.query(`DELETE FROM step_connections WHERE "processId" = $1`, [TENDER_PROCESS_ID]);
    await c.query(`DELETE FROM process_steps WHERE "processId" = $1`, [TENDER_PROCESS_ID]);
    await c.query(`DELETE FROM processes WHERE id = $1`, [TENDER_PROCESS_ID]);
    await c.query(`DELETE FROM roles WHERE "workspaceId" = $1 AND id LIKE $2`, [
      WORKSPACE_ID,
      "tender-process-role-%",
    ]);
  });
}

export async function makeTenderProcess(): Promise<{ id: string; code: string; stepCount: number }> {
  await removeTenderProcess();

  await withClient(async (c) => {
    const roleId: Record<string, string> = {};
    for (const [i, name] of ROLES.entries()) {
      const id = `tender-process-role-${i}`;
      await c.query(`INSERT INTO roles (id, "workspaceId", name) VALUES ($1, $2, $3)`, [id, WORKSPACE_ID, name]);
      roleId[name] = id;
    }

    await c.query(
      `INSERT INTO processes (id, "workspaceId", code, name, description, "processPurpose",
                              "raciVisibleRoleIds", "inScope", "outOfScope", "externalEntities", kpis,
                              "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, '{}', '{}', '{}', '[]', '[]', now(), now())`,
      [
        TENDER_PROCESS_ID,
        WORKSPACE_ID,
        TENDER_PROCESS_CODE,
        "Tender to contract",
        "Eighteen steps, two forking decisions, and labels long enough to overflow a print card.",
        "Exercises the printed map's wrapping on a process that branches rather than running in a straight chain.",
      ]
    );

    for (const [i, step] of STEPS.entries()) {
      await c.query(
        `INSERT INTO process_steps (id, "processId", type, label, "order", "positionX", "positionY",
                                    "detailedAction", milestone, "assignedRoleId", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, '{}', false, $7, now())`,
        [
          `${TENDER_PROCESS_ID}-step-${i + 1}`,
          TENDER_PROCESS_ID,
          i === 0 ? "START" : i === STEPS.length - 1 ? "END" : step.decision ? "DECISION" : "TASK",
          step.label,
          i + 1,
          FIRST_STEP_X + i * STEP_X_SPACING,
          roleId[step.role]!,
        ]
      );
    }

    for (const [i, connection] of CONNECTIONS.entries()) {
      await c.query(
        `INSERT INTO step_connections (id, "processId", "fromStepId", "toStepId", label)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `${TENDER_PROCESS_ID}-conn-${i + 1}`,
          TENDER_PROCESS_ID,
          `${TENDER_PROCESS_ID}-step-${connection.from}`,
          `${TENDER_PROCESS_ID}-step-${connection.to}`,
          connection.label ?? null,
        ]
      );
    }
  });

  return { id: TENDER_PROCESS_ID, code: TENDER_PROCESS_CODE, stepCount: STEPS.length };
}
