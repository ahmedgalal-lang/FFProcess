import type { Page } from "@playwright/test";

/**
 * The seeded accounts these tests run against (see prisma/seed.ts). They live
 * here rather than in the login page: the page used to ship with them as
 * defaultValue on the email and password inputs plus a line naming them under
 * the button, which handed a working Firm Owner login to everyone who opened
 * the sign-in page — including every client sent an invitation link.
 */
export const SEEDED_FIRM_OWNER = {
  email: "ahmed.galal@forefront.consulting",
  password: "password123",
};

export const SEEDED_EDITOR = {
  email: "sam.osei@acme-example.com",
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
