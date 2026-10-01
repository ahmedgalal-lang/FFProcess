import "dotenv/config";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";
import { processIdByCode } from "./seed-lookup";

/**
 * Arabic reports and exports (spec 032), from an English interface. The
 * translations are saved here directly, as an editor's corrections would be,
 * because the test environment has no AI key: that also exercises the notice
 * for entries left untranslated.
 */
const WORKSPACE = "workspace-acme";
const SAVED: Record<string, string> = {
  "Procure-to-Pay Program": "برنامج الشراء حتى الدفع",
  "Create Purchase Order": "إنشاء أمر شراء",
};
const hash = (text: string) => createHash("sha256").update(text.trim(), "utf8").digest("hex");

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: process.env["DATABASE_URL"] });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

test.describe("Arabic reports and exports", () => {
  test.beforeEach(async ({ page }) => {
    await withDb(async (db) => {
      for (const [source, text] of Object.entries(SAVED)) {
        await db.query(
          `INSERT INTO content_translations (id, "workspaceId", locale, "sourceHash", "sourceText", text, origin, "updatedAt")
           VALUES (gen_random_uuid()::text, $1, 'ar', $2, $3, $4, 'MANUAL', now())
           ON CONFLICT ("workspaceId", locale, "sourceHash") DO UPDATE SET text = EXCLUDED.text, origin = 'MANUAL'`,
          [WORKSPACE, hash(source), source, text]
        );
      }
    });
    await signIn(page);
  });

  test.afterEach(async () => {
    await withDb((db) =>
      db.query(`DELETE FROM content_translations WHERE "workspaceId" = $1 AND "sourceHash" = ANY($2)`, [
        WORKSPACE,
        Object.keys(SAVED).map(hash),
      ])
    );
  });

  test("an English interface produces an Arabic report, entries included", async ({ page }) => {
    await page.goto(`/workspaces/${WORKSPACE}/export`);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.getByRole("radio", { name: "العربية" }).check();
    await expect(page.getByRole("status").filter({ hasText: "entries translated into Arabic" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Select all processes" }).check();
    await page.getByRole("button", { name: /Preview report/ }).click();

    await expect(page).toHaveURL(/lang=ar/);
    const report = page.locator(".report-root");
    await expect(report).toHaveAttribute("dir", "rtl");
    await expect(report).toHaveAttribute("lang", "ar");
    await expect(page.getByRole("heading", { name: "العمليات في هذا التقرير" })).toBeVisible();
    // A translated entry, with its code kept as written.
    await expect(page.getByRole("heading", { name: "برنامج الشراء حتى الدفع", level: 2 })).toBeVisible();
    await expect(page.getByText("PUR100").first()).toBeVisible();
    // The AI isn't configured here, so the rest print as typed — and the report says so.
    await expect(page.getByRole("status").filter({ hasText: "الترجمة بالذكاء الاصطناعي غير مُعدّة" })).toBeVisible();

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });

  test("a corrected translation is used in the next report", async ({ page }) => {
    await page.goto(`/workspaces/${WORKSPACE}/export/translations?q=Create+Purchase+Order`);
    const field = page.getByRole("textbox", { name: "Arabic translation of Create Purchase Order" });
    await expect(field).toHaveValue("إنشاء أمر شراء");
    await field.fill("إصدار أمر شراء");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await expect(page.locator('[data-translation="Create Purchase Order"]')).toContainText("Corrected by hand");

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);

    const id = await processIdByCode("PUR101");
    await page.goto(`/reports/${WORKSPACE}?ids=${id}&lang=ar`);
    await expect(page.locator(".report-root").getByText("إصدار أمر شراء").first()).toBeVisible();
  });

  test("the deck, the spreadsheets and the PDFs download in Arabic", async ({ page }) => {
    const id = await processIdByCode("PUR100");
    const deck = await page.request.get(`/api/export/report/${WORKSPACE}?ids=${id}&lang=ar`);
    expect(deck.status()).toBe(200);
    expect(deck.headers()["content-type"]).toContain("presentationml");

    const pur101 = await processIdByCode("PUR101");
    for (const url of [
      `/api/export/raci/${pur101}?format=xlsx&lang=ar`,
      `/api/export/authority/${pur101}?format=xlsx&lang=ar`,
      `/api/export/raci/${pur101}?format=pdf&lang=ar`,
      `/api/export/authority/${pur101}?format=pdf&lang=ar`,
      `/api/export/process-map/${pur101}?lang=ar`,
    ]) {
      const response = await page.request.get(url);
      expect(response.status(), url).toBe(200);
      expect((await response.body()).length, url).toBeGreaterThan(1000);
    }
  });
});
