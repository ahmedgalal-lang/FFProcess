import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { E2E_EDITOR } from "./sign-in";

const SEEDED_PROCESS_CODES = ["PUR100", "PUR101", "PUR102", "SAL101"];
const SEEDED_ROLES = ["AP Clerk", "Finance Manager", "Procurement Lead"];

/**
 * Puts the shared development database back to its seeded state before the
 * suite runs.
 *
 * These specs write to the same database the app develops against, and some of
 * what they create — a process, a phase, an invited user — has no way back
 * through the UI. A spec that cleans up after itself still leaves debris when
 * the run is interrupted or the database is briefly unreachable, and the next
 * run then fails somewhere unrelated on a count that no longer matches. Doing
 * it up front means a run's outcome doesn't depend on how the last one ended.
 */
export default async function globalSetup() {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`DELETE FROM processes WHERE code <> ALL($1)`, [SEEDED_PROCESS_CODES]);
    await client.query(`DELETE FROM phases`);
    await client.query(`DELETE FROM roles WHERE name <> ALL($1)`, [SEEDED_ROLES]);
    await client.query(`DELETE FROM users WHERE email LIKE 'invite-test-%'`);
    // The seed's own process upserts use update: {} — a reseed never resets a
    // field on a row that already exists, so a KPI a spec saved on a seeded
    // process (there's no UI path to remove one) would otherwise still be
    // there on the next run.
    await client.query(`UPDATE processes SET kpis = '[]'::jsonb WHERE code = ANY($1)`, [SEEDED_PROCESS_CODES]);
  } finally {
    await client.end();
  }

  // The seed owns everything else about the seeded rows — step order, roles,
  // positions, and the flags a session may have set on them.
  //
  // SEED_DEMO_WORKSPACE is what builds "Acme Industrial" and the four
  // processes every spec below asserts against. It is opt-in precisely so a
  // plain `pnpm db:seed` cannot create a fictional client in a real
  // deployment; the tests are the only caller that wants one.
  execFileSync("pnpm", ["run", "db:seed"], {
    stdio: "inherit",
    env: { ...process.env, SEED_DEMO_WORKSPACE: "1" },
  });

  await createEditorFixture();
  await createPeopleFixture();
}

/**
 * The non-owner account several specs sign in as.
 *
 * This used to be a seeded stand-in employee, a fictional person who
 * nonetheless had a real login on the same well-known password — so every
 * database the seed had ever touched, deployed ones included, carried a
 * working Editor account for someone who did not exist. A test needs a second
 * user; a product seed does not, so it lives here now, named for what it is.
 *
 * Recreated from scratch each run rather than upserted: the firm-owner spec
 * promotes and demotes this account, and dropping the user takes its
 * firm_members row with it, so every run starts from the same state instead
 * of inheriting whatever the last one left.
 */
async function createEditorFixture() {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`DELETE FROM users WHERE email = $1`, [E2E_EDITOR.email]);
    const userId = crypto.randomUUID();
    await client.query(
      `INSERT INTO users (id, email, name, "passwordHash", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())`,
      [userId, E2E_EDITOR.email, E2E_EDITOR.name, await bcrypt.hash(E2E_EDITOR.password, 10)]
    );
    await client.query(
      `INSERT INTO members (id, "workspaceId", "userId", "accessLevel", status, "createdAt", "updatedAt")
       VALUES ($1, 'workspace-acme', $2, 'EDITOR', 'ACTIVE', now(), now())`,
      [crypto.randomUUID(), userId]
    );
  } finally {
    await client.end();
  }
}

/**
 * Staff for the Org Directory and Org Chart specs.
 *
 * The seed used to invent these — a directory full of people who do not exist,
 * in what is a real client's workspace on a real deployment. Only the tests
 * ever needed them: three specs assert on the org chart, which cannot draw
 * anything without people. So the invented staff moved here, where invented is
 * the point, and the seed now ships an empty directory for a client to fill in
 * themselves.
 *
 * Reuses whichever seeded roles exist rather than creating its own, so the
 * chart is drawn from the same roles the RACI and Authority data reference.
 */
async function createPeopleFixture() {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    const people = [
      ["E2E Person One", "person1.e2e@example.com", "AP Clerk"],
      ["E2E Person Two", "person2.e2e@example.com", "Finance Manager"],
      ["E2E Person Three", "person3.e2e@example.com", "Procurement Lead"],
    ] as const;

    for (const [name, email, roleName] of people) {
      const personId = `person-e2e-${email}`;
      await client.query(`DELETE FROM people WHERE id = $1`, [personId]);
      await client.query(
        `INSERT INTO people (id, "workspaceId", name, email, "createdAt")
         VALUES ($1, 'workspace-acme', $2, $3, now())`,
        [personId, name, email]
      );
      const role = await client.query<{ id: string }>(
        `SELECT id FROM roles WHERE "workspaceId" = 'workspace-acme' AND name = $1`,
        [roleName]
      );
      const roleId = role.rows[0]?.id;
      if (roleId) {
        await client.query(
          `INSERT INTO person_roles ("personId", "roleId") VALUES ($1, $2)`,
          [personId, roleId]
        );
      }
    }
  } finally {
    await client.end();
  }
}
