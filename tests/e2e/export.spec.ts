import { test, expect } from "@playwright/test";

// NOTE: runs against the same dev database seeded by `pnpm db:seed` (see
// prisma/seed.ts), same pragmatic choice as core-workflows.spec.ts.

test.describe("Export", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.click('button[type="submit"]'); // seeded Firm Owner credentials are pre-filled
    await page.waitForURL("**/workspaces");
  });

  test("RACI PDF and Excel downloads return well-formed files", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click("text=Build RACI");
    await page.waitForURL("**/raci");

    const pdfHref = await page.locator('a:has-text("Export PDF")').getAttribute("href");
    const pdfResponse = await page.request.get(pdfHref!);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toBe("application/pdf");
    expect(pdfResponse.headers()["content-disposition"]).toContain("PUR101-raci-matrix.pdf");
    const pdfBody = await pdfResponse.body();
    expect(pdfBody.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const xlsxHref = await page.locator('a:has-text("Export Excel")').getAttribute("href");
    const xlsxResponse = await page.request.get(xlsxHref!);
    expect(xlsxResponse.status()).toBe(200);
    expect(xlsxResponse.headers()["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const xlsxBody = await xlsxResponse.body();
    expect(xlsxBody.subarray(0, 2).toString("latin1")).toBe("PK"); // xlsx is a zip container
  });

  test("Authority PDF and Excel downloads return well-formed files", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes/7a8eb0b6-cd1d-42ed-a3b1-9b5a0137a5e8/authority");
    await page.waitForSelector("text=Escalation");

    const pdfHref = await page.locator('a:has-text("Export PDF")').first().getAttribute("href");
    const pdfResponse = await page.request.get(pdfHref!);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toBe("application/pdf");
    expect(pdfResponse.headers()["content-disposition"]).toContain("PUR101-authority-matrix.pdf");
    const pdfBody = await pdfResponse.body();
    expect(pdfBody.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const xlsxHref = await page.locator('a:has-text("Export Excel")').first().getAttribute("href");
    const xlsxResponse = await page.request.get(xlsxHref!);
    expect(xlsxResponse.status()).toBe(200);
    expect(xlsxResponse.headers()["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const xlsxBody = await xlsxResponse.body();
    expect(xlsxBody.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  test("Process Map PDF download returns a well-formed file", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");

    const pdfHref = await page.locator('a:has-text("Export PDF")').getAttribute("href");
    const pdfResponse = await page.request.get(pdfHref!);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toBe("application/pdf");
    expect(pdfResponse.headers()["content-disposition"]).toContain("PUR101-process-map.pdf");
    const pdfBody = await pdfResponse.body();
    expect(pdfBody.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("Process Map PNG export produces a downloadable image from the live canvas", async ({ page }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.waitForSelector(".react-flow__node");

    const downloadPromise = page.waitForEvent("download");
    await page.click('button:has-text("PNG")');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("PUR101-process-map.png");
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test("Export routes reject unauthenticated requests", async ({ page, browser }) => {
    await page.goto("/workspaces/workspace-acme/processes");
    await page.locator("tr", { hasText: "PUR101" }).first().locator("text=Open").click();
    await page.waitForURL("**/map");
    await page.click("text=Build RACI");
    await page.waitForURL("**/raci");
    const pdfHref = await page.locator('a:has-text("Export PDF")').getAttribute("href");

    const loggedOutContext = await browser.newContext();
    const response = await loggedOutContext.request.get(`http://localhost:3000${pdfHref}`);
    expect(response.status()).toBe(401);
    await loggedOutContext.close();
  });
});
