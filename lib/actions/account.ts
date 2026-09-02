"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { auth } from "@/lib/auth/config";
import { ok, notFound, unauthorized, validationError, type ActionResult } from "@/lib/actions/errors";

/**
 * The same floor the invitation flow already sets when a new joiner picks
 * their own password — a password changed later shouldn't be allowed to be
 * weaker than one set at sign-up.
 */
const MIN_PASSWORD_LENGTH = 8;

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

/**
 * Changes the signed-in user's own password.
 *
 * The current password is required and verified even though the session
 * already proves who they are: it's what stops someone who walked up to an
 * unlocked screen from locking the real owner out of their account.
 */
export async function changeOwnPassword(
  input: z.infer<typeof changePasswordSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(
      `Your new password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`,
      parsed.error.issues
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return notFound();

  // An account created through an OAuth provider has no password to change —
  // say so rather than failing the comparison with a misleading "incorrect".
  if (!user.passwordHash) {
    return validationError("This account doesn't sign in with a password.");
  }

  const currentIsValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentIsValid) return validationError("That isn't your current password.");

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return validationError("Your new password is the same as your current one.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return ok({ id: userId });
}

const updateOwnNameSchema = z.object({ name: z.string().trim().min(1).max(120) });

/** Renames the signed-in user — the display name beside their email in the header. */
export async function updateOwnName(
  input: z.infer<typeof updateOwnNameSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateOwnNameSchema.safeParse(input);
  if (!parsed.success) return validationError("Enter a name.", parsed.error.issues);

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();

  await prisma.user.update({ where: { id: userId }, data: { name: parsed.data.name } });
  return ok({ id: userId });
}
