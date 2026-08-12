import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Next.js's bundler aliases this marker package away; Vitest runs in plain Node
      // and needs a real (no-op) module to resolve it to. See the shim file for why.
      "server-only": fileURLToPath(new URL("./tests/integration/server-only-shim.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["dotenv/config", "./tests/integration/setup.ts"],
  },
});
