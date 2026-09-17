/**
 * CLI wrapper for the long-process fixture, for looking at it by hand.
 *
 *   pnpm exec tsx ./scripts/make-long-process.ts
 *   pnpm exec tsx ./scripts/make-long-process.ts --clean
 *
 * The builder itself lives with the other test fixtures, because the
 * end-to-end spec imports it and a module that runs work on import cannot be
 * imported.
 */
import { makeLongProcess, removeLongProcess } from "../tests/fixtures/long-process";

async function main() {
  if (process.argv.includes("--clean")) {
    await removeLongProcess();
    console.log("long-process fixture removed");
    return;
  }
  const made = await makeLongProcess();
  console.log(`${made.code} created: ${made.stepCount} steps`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
