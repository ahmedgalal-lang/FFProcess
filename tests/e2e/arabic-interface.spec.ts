import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

/**
 * The Arabic interface (spec 031): the switcher, right-to-left layout, and
 * the Governance area in Arabic. Read-only: the language lives in this test's
 * own browser cookie, so other tests are unaffected and nothing is seeded.
 */
const WORKSPACE = "workspace-acme";

test.describe("Arabic interface", () => {
  test("the switcher turns the interface to Arabic, right to left, and back", async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await page.getByRole("button", { name: "العربية" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.getByRole("heading", { name: "الحوكمة والضوابط والمؤشرات" })).toBeVisible();
    await expect(page.getByRole("link", { name: "الحوكمة", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "true");

    // The choice survives a reload.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await page.getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { name: "Governance, Controls & Metrics" })).toBeVisible();
  });

  test.describe("Governance in Arabic", () => {
    test.beforeEach(async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "ffp-locale", value: "ar", url: baseURL ?? "http://localhost:3000" }]);
      await signIn(page);
      await page.goto(`/workspaces/${WORKSPACE}/governance`);
    });

    test("section guides read in Arabic, and the arrow keys follow the reading direction", async ({ page }) => {
      await page.getByRole("button", { name: "حول سجل المخاطر", exact: true }).click();
      const guide = page.getByRole("dialog", { name: "سجل المخاطر" });
      await expect(guide).toBeVisible();
      await expect(guide).toContainText("سجل المخاطر هو جوهر أي برنامج حوكمة");

      // Right to left, the next tab is to the left.
      await guide.getByRole("tab", { name: "لماذا يهم" }).focus();
      await page.keyboard.press("ArrowLeft");
      await expect(guide.getByRole("tab", { name: "كيفية التعبئة" })).toHaveAttribute("aria-selected", "true");

      // The popover stays on screen.
      const box = (await guide.boundingBox())!;
      const width = page.viewportSize()!.width;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);

      await page.keyboard.press("Escape");
      await expect(guide).toHaveCount(0);
    });

    test("policy templates are offered in Arabic", async ({ page }) => {
      const panel = page.locator("#governing-policy");
      const start = panel.getByRole("button", { name: "البدء من قالب" });
      test.skip((await start.count()) === 0, "the open aspect already has a governing policy");
      await start.click();
      const picker = panel.getByRole("group", { name: "اختر قالبًا" });
      await expect(picker).toBeVisible();
      await expect(picker.getByText("مقترح").first()).toBeVisible();
      await expect(picker).toContainText("سياسة إدارة المخاطر");
      await expect(panel.getByRole("button", { name: "استخدام القالب" })).toBeVisible();
    });

    test("the Arabic page passes an accessibility scan", async ({ page }) => {
      await expect(page.getByRole("heading", { name: "الحوكمة والضوابط والمؤشرات" })).toBeVisible();
      const results = await new AxeBuilder({ page }).include("main").analyze();
      expect(results.violations).toEqual([]);
    });
  });
});
