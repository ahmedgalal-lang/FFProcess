import "dotenv/config";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import { signIn } from "./sign-in";
import { makeParallelStepProcess, removeParallelStepProcess, PARALLEL_PROCESS_ID } from "../fixtures/parallel-step-process";

/**
 * The company logo (already uploadable via Workspace Settings' branding
 * panel, WorkspaceBranding) now prints on the Export Report's cover — it
 * used to stop at the in-app sidebar, and the report always showed a plain
 * gradient placeholder square instead, even when a real logo was on file.
 */
const WORKSPACE = "workspace-acme";
// A 1x1 transparent PNG — small enough to embed directly in the test, real
// enough to exercise the exact data: URL shape validateLogoDataUrl accepts.
const TINY_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function setLogo(logoDataUrl: string | null) {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(`UPDATE workspaces SET "logoDataUrl" = $2 WHERE id = $1`, [WORKSPACE, logoDataUrl]);
  } finally {
    await client.end();
  }
}

test.describe("the report cover's logo", () => {
  test.beforeEach(makeParallelStepProcess);
  test.afterAll(async () => {
    await removeParallelStepProcess();
    await setLogo(null);
  });

  test("prints the workspace's own logo when one is set", async ({ page }) => {
    await setLogo(TINY_LOGO);
    await signIn(page);
    await page.goto(`/reports/${WORKSPACE}?ids=${PARALLEL_PROCESS_ID}`);
    await page.waitForSelector(".report-paper");

    const cover = page.locator(".report-paper section").first();
    await expect(cover.locator("img[src^='data:image/png']")).toHaveAttribute("src", TINY_LOGO);
  });

  test("falls back to the plain placeholder when no logo is set", async ({ page }) => {
    await setLogo(null);
    await signIn(page);
    await page.goto(`/reports/${WORKSPACE}?ids=${PARALLEL_PROCESS_ID}`);
    await page.waitForSelector(".report-paper");

    const cover = page.locator(".report-paper section").first();
    await expect(cover.locator("img")).toHaveCount(0);
  });
});
