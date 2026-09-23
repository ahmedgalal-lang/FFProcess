"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { ok, validationError, type ActionResult } from "@/lib/actions/errors";
import type { ReportMapLayout } from "@/app/generated/prisma/client";

const saveSchema = z.object({
  workspaceId: z.string().min(1),
  layout: z.enum(["FLOW", "ROLES"]),
});

/**
 * Chooses which layout a client's printed process map uses.
 *
 * Per workspace, for the same reason the report arrangement is: a pack is one
 * document, and a map that changed layout between two processes inside it would
 * read as a mistake. It persists, unlike the Spacing control beside it, so a
 * client's pack does not change shape between one quarter and the next.
 *
 * Last write wins. Two editors choosing at the same moment is rare enough that
 * a lock would cost more than it saves.
 */
export async function setReportMapLayout(
  input: z.infer<typeof saveSchema>
): Promise<ActionResult<{ workspaceId: string }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid map layout", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  await prisma.workspace.update({
    where: { id: parsed.data.workspaceId },
    data: { reportMapLayout: parsed.data.layout as ReportMapLayout },
  });

  revalidatePath(`/reports/${parsed.data.workspaceId}`);
  return ok({ workspaceId: parsed.data.workspaceId });
}
