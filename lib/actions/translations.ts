"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { notFound, ok, validationError, type ActionResult } from "@/lib/actions/errors";
import { loadReportData } from "@/lib/reports/load-report-data";
import { localizeReportData } from "@/lib/reports/localize-report-data";
import type { TranslationFailureKind } from "@/lib/translation/translate";

/**
 * The saved translations behind Arabic reports (spec 032). Translating and
 * correcting both write to the workspace, so both need EDITOR; reading the
 * list needs only VIEWER and happens on the translations page itself.
 */

const revalidate = (workspaceId: string) => {
  revalidatePath(`/workspaces/${workspaceId}/export`);
  revalidatePath(`/workspaces/${workspaceId}/export/translations`);
};

const prepareSchema = z.object({ workspaceId: z.string().min(1) });

/**
 * Translates every entry the workspace's full report would print, ahead of
 * exporting, so the consultant sees what was left untranslated and why
 * before handing anything to a client. One call is one round of about
 * twenty seconds; the picker repeats it while `pending` is true, so no single
 * request outlives the hosting proxy's timeout.
 */
export async function prepareReportTranslations(
  input: z.infer<typeof prepareSchema>
): Promise<ActionResult<{ total: number; untranslated: number; failureKind: TranslationFailureKind | null; pending: boolean }>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);
  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId } = parsed.data;
  const processes = await prisma.process.findMany({ where: { workspaceId, archivedAt: null }, select: { id: true } });
  const data = await loadReportData(
    workspaceId,
    processes.map((p) => p.id)
  );
  if (!data) return notFound();

  const outcome = await localizeReportData(data, "ar", { allowAi: true });
  revalidate(workspaceId);
  return ok({
    total: outcome.total,
    untranslated: outcome.untranslated,
    failureKind: outcome.failureKind,
    // One round per call: the picker calls again while this is true.
    pending: outcome.pending,
  });
}

const updateSchema = z.object({
  workspaceId: z.string().min(1),
  translationId: z.string().min(1),
  text: z.string().trim().min(1, "Enter the translation.").max(20000),
});

/** Corrects a saved translation by hand. The AI never replaces a corrected one. */
export async function updateTranslation(input: z.infer<typeof updateSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.issues);
  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, translationId, text } = parsed.data;
  const updated = await prisma.contentTranslation.updateMany({
    where: { id: translationId, workspaceId },
    data: { text, origin: "MANUAL", editedById: access.data.userId },
  });
  if (updated.count === 0) return notFound();
  revalidate(workspaceId);
  return ok({ id: translationId });
}

const resetSchema = z.object({ workspaceId: z.string().min(1), translationId: z.string().min(1) });

/** Drops a saved translation, so the next Arabic export has the AI translate the text afresh. */
export async function resetTranslation(input: z.infer<typeof resetSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid input", parsed.error.issues);
  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { workspaceId, translationId } = parsed.data;
  const deleted = await prisma.contentTranslation.deleteMany({ where: { id: translationId, workspaceId } });
  if (deleted.count === 0) return notFound();
  revalidate(workspaceId);
  return ok({ id: translationId });
}
