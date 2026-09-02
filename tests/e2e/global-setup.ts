import { execFileSync } from "node:child_process";
import "dotenv/config";
import { Client } from "pg";

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
  execFileSync("pnpm", ["run", "db:seed"], { stdio: "inherit" });
}
