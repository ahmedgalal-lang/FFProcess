import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";
import { sourceHash } from "@/lib/translation/translatable";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({ auth: mockAuth, signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateTranslation, resetTranslation } = await import("@/lib/actions/translations");
const { translateTexts } = await import("@/lib/translation/translate");
const { prisma } = await import("@/lib/db/client");

async function saved(workspaceId: string, source: string, text: string) {
  return prisma.contentTranslation.create({
    data: { workspaceId, locale: "ar", sourceHash: sourceHash(source), sourceText: source, text },
  });
}

describe("correcting translations (spec 032)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let workspaceId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    workspaceId = fixture.workspace.id;
    mockAuth.mockResolvedValue({ user: { id: fixture.adminUser.id } });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("saves a correction as MANUAL, and later exports use it", async () => {
    const row = await saved(workspaceId, "Finance", "تمويل");
    const result = await updateTranslation({ workspaceId, translationId: row.id, text: "  الإدارة المالية " });
    expect(result.ok).toBe(true);
    const after = await prisma.contentTranslation.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ text: "الإدارة المالية", origin: "MANUAL", editedById: fixture.adminUser.id });
    const outcome = await translateTexts(workspaceId, ["Finance"], "ar", { allowAi: false });
    expect(outcome.lookup("Finance")).toBe("الإدارة المالية");
  });

  it("refuses an empty correction", async () => {
    const row = await saved(workspaceId, "Finance", "تمويل");
    const result = await updateTranslation({ workspaceId, translationId: row.id, text: "   " });
    expect(result).toMatchObject({ ok: false, error: "VALIDATION_ERROR" });
  });

  it("drops a translation on reset, so the next export translates afresh", async () => {
    const row = await saved(workspaceId, "Finance", "تمويل");
    expect((await resetTranslation({ workspaceId, translationId: row.id })).ok).toBe(true);
    expect(await prisma.contentTranslation.count({ where: { id: row.id } })).toBe(0);
  });

  it("needs EDITOR: a viewer can't correct or reset", async () => {
    const row = await saved(workspaceId, "Finance", "تمويل");
    const viewer = await fixture.addMember("VIEWER");
    mockAuth.mockResolvedValue({ user: { id: viewer.user.id } });
    expect(await updateTranslation({ workspaceId, translationId: row.id, text: "x" })).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(await resetTranslation({ workspaceId, translationId: row.id })).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect((await prisma.contentTranslation.findUniqueOrThrow({ where: { id: row.id } })).text).toBe("تمويل");
  });

  it("can't reach another workspace's translation", async () => {
    const other = await createFixtureWorkspace();
    try {
      const theirs = await saved(other.workspace.id, "Finance", "تمويل");
      expect(await updateTranslation({ workspaceId, translationId: theirs.id, text: "مخترق" })).toMatchObject({ ok: false, error: "NOT_FOUND" });
      expect(await resetTranslation({ workspaceId, translationId: theirs.id })).toMatchObject({ ok: false, error: "NOT_FOUND" });
      expect((await prisma.contentTranslation.findUniqueOrThrow({ where: { id: theirs.id } })).text).toBe("تمويل");
    } finally {
      await other.cleanup();
    }
  });
});
