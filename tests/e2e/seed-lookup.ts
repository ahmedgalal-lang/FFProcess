import "dotenv/config";
import { Client } from "pg";

/**
 * Resolves a seeded process's id from its code.
 *
 * Several specs need to open a process page directly rather than clicking
 * through the list, and they used to do it with a process id pasted in from
 * whichever database the author happened to have. Seeded processes get fresh
 * uuids every `pnpm db:seed`, so those ids rotted the moment anyone re-seeded
 * and the specs 404'd on a perfectly good build. The code is the stable
 * handle — it is what the seed actually pins — so look the id up by that.
 */
export async function processIdByCode(code: string): Promise<string> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(`SELECT id FROM processes WHERE code = $1`, [code]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`No seeded process with code ${code} — run "pnpm db:seed" first.`);
    return id;
  } finally {
    await client.end();
  }
}
