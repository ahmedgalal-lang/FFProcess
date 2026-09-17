"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { ok, validationError, type ActionResult } from "@/lib/actions/errors";
import {
  ARRANGEMENT_VERSION,
  BLOCKS,
  PACK_SECTIONS,
  PROCESS_SECTIONS,
} from "@/lib/domain/report-arrangement";

const PACK_IDS = new Set(PACK_SECTIONS.map((s) => s.id));
const SECTION_IDS = new Set(PROCESS_SECTIONS.map((s) => s.id));
const BLOCK_IDS = new Set(BLOCKS.map((b) => b.id));
const LOCKED_PACK_IDS = new Set(PACK_SECTIONS.filter((s) => s.locked).map((s) => s.id));

const entry = z.object({ id: z.string().min(1), on: z.boolean() });

const saveSchema = z.object({
  workspaceId: z.string().min(1),
  arrangement: z.object({
    pack: z.array(entry),
    sections: z.array(entry),
    blocks: z.array(entry.extend({ sec: z.string().min(1) })),
  }),
});

/**
 * Saves how one client's report pack is arranged.
 *
 * Per workspace, deliberately: an arrangement that leaked between clients would
 * be worse than no arrangement at all, because a consultant would have to check
 * it before every export. The column lives on the workspace row, so that cannot
 * happen by construction rather than by remembering to filter.
 *
 * Last save wins. Two editors arranging the same client at the same time is
 * rare enough that a lock, a merge or a conflict warning would cost more than
 * it saves.
 */
export async function saveReportArrangement(
  input: z.infer<typeof saveSchema>
): Promise<ActionResult<{ workspaceId: string }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid arrangement", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const { pack, sections, blocks } = parsed.data.arrangement;

  // Ids the catalogue does not know are rejected rather than stored. A client
  // running an older build should get a clear failure, not a silently corrupt
  // arrangement that resolves into something nobody chose.
  if (pack.some((e) => !PACK_IDS.has(e.id))) {
    return validationError("Unknown pack section", []);
  }
  if (sections.some((e) => !SECTION_IDS.has(e.id))) {
    return validationError("Unknown section", []);
  }
  if (blocks.some((e) => !BLOCK_IDS.has(e.id) || !SECTION_IDS.has(e.sec))) {
    return validationError("Unknown block or section", []);
  }

  await prisma.workspace.update({
    where: { id: parsed.data.workspaceId },
    data: {
      reportArrangement: {
        version: ARRANGEMENT_VERSION,
        // A locked section is included however the request was shaped — a
        // document without a cover page is not a pack.
        pack: pack.map((e) => ({ id: e.id, on: LOCKED_PACK_IDS.has(e.id) ? true : e.on })),
        sections,
        blocks,
      },
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/export`);
  revalidatePath(`/reports/${parsed.data.workspaceId}`);
  return ok({ workspaceId: parsed.data.workspaceId });
}
