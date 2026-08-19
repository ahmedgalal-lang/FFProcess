"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireWorkspaceAccess } from "@/lib/auth/workspace";
import { ok, validationError, type ActionResult } from "@/lib/actions/errors";

const createProcessCategorySchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});

/**
 * Creates a standardized process category (HR, Sales, Procurement, ...).
 * Categories are shared across every Workspace in the caller's Firm — the
 * taxonomy is firm-wide, not re-entered per client (Constitution Principle
 * II) — but the auth check still goes through the Workspace the caller is
 * acting from, matching every other inline-creatable lookup (Role, Decision
 * Type) in this app.
 */
export async function createProcessCategory(
  input: z.infer<typeof createProcessCategorySchema>
): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = createProcessCategorySchema.safeParse(input);
  if (!parsed.success) return validationError("Invalid category input", parsed.error.issues);

  const access = await requireWorkspaceAccess(parsed.data.workspaceId, "EDITOR");
  if (!access.ok) return access;

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: parsed.data.workspaceId } });

  const existing = await prisma.processCategory.findFirst({
    where: { firmId: workspace.firmId, name: parsed.data.name },
  });
  if (existing) return ok({ id: existing.id, name: existing.name });

  const category = await prisma.processCategory.create({
    data: { firmId: workspace.firmId, name: parsed.data.name },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}/processes`);
  return ok({ id: category.id, name: category.name });
}
