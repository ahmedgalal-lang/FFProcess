import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

/** The ⓘ section guides on the Governance page (spec 030). Read-only: nothing to seed or clean up. */
const WORKSPACE = "workspace-acme";

const SECTIONS = [
  "What needs attention",
  "Governance profile",
  "Governance assessment",
  "Governing policy",
  "Risk register",
  "Policy library",
  "Activity",
  "Key Control Points & KPIs",
];

test.describe("governance section guides", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto(`/workspaces/${WORKSPACE}/governance`);
  });

  test("every section has a guide button beside its heading", async ({ page }) => {
    for (const title of SECTIONS) {
      await expect(page.getByRole("button", { name: `About ${title}`, exact: true })).toHaveCount(1);
    }
    // Headings keep their own names.
    await expect(page.getByRole("heading", { name: "Risk register", exact: true })).toBeVisible();
  });

  test("opens a guide, switches tabs by keyboard, and closes with Esc back to the button", async ({ page }) => {
    const button = page.getByRole("button", { name: "About Risk register", exact: true });
    await button.click();
    const guide = page.getByRole("dialog", { name: "Risk register" });
    await expect(guide).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(guide).toContainText("A risk register is the core of any governance programme");
    await expect(guide.getByRole("tab", { name: "Why it matters" })).toHaveAttribute("aria-selected", "true");

    await guide.getByRole("tab", { name: "Why it matters" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(guide.getByRole("tab", { name: "How to fill it in" })).toHaveAttribute("aria-selected", "true");
    await expect(guide.getByRole("tabpanel")).toContainText("Assign an owner who has the authority to act on it.");

    await guide.getByRole("tab", { name: "How to evaluate it" }).click();
    await expect(guide.getByRole("tabpanel")).toContainText("Good signs");
    await expect(guide.getByRole("tabpanel")).toContainText("Warning signs");

    const results = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
    expect(results.violations).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("keeps one guide open at a time, and closes on a click outside", async ({ page }) => {
    await page.getByRole("button", { name: "About Governance profile", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Governance profile" })).toBeVisible();

    await page.getByRole("button", { name: "About Policy library", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Policy library" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Governance profile" })).toHaveCount(0);

    await page.getByRole("heading", { name: "Governance, Controls & Metrics" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
