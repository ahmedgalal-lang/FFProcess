import type { Page } from "@playwright/test";

/**
 * The Firm Owner these tests run against, seeded by prisma/seed.ts. It lives
 * here rather than in the login page: the page used to ship with it as
 * defaultValue on the email and password inputs plus a line naming it under
 * the button, which handed a working Firm Owner login to everyone who opened
 * the sign-in page — including every client sent an invitation link.
 */
export const SEEDED_FIRM_OWNER = {
  email: "ahmed.galal@forefront.consulting",
  password: "password123",
};

/**
 * The non-owner account, created by the e2e global setup rather than seeded.
 *
 * The seed used to ship a second sign-in belonging to a fictional employee,
 * which meant a person who did not exist held a working Editor login on every
 * database the seed had touched. A test fixture is what this always was, so it
 * is named as one and created where the tests are.
 */
export const E2E_EDITOR = {
  email: "editor.e2e@example.com",
  name: "E2E Editor",
  password: "password123",
};

/** Sign in and wait for the workspaces list, the landing page after login. */
export async function signIn(
  page: Page,
  { email, password }: { email: string; password: string } = SEEDED_FIRM_OWNER
) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/workspaces");
}
