import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFixtureWorkspace } from "./fixtures";
import { sourceHash } from "@/lib/translation/translatable";

const { mockTranslateBatch } = vi.hoisted(() => ({ mockTranslateBatch: vi.fn() }));
vi.mock("@/lib/translation/ai-translate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/translation/ai-translate")>()),
  translateBatch: mockTranslateBatch,
}));

const { translateTexts } = await import("@/lib/translation/translate");
const { prisma } = await import("@/lib/db/client");

/** A fake AI: "Arabic" is the text in brackets, so a test can tell what was sent. */
function fakeAi() {
  mockTranslateBatch.mockImplementation(async (items: { id: string; text: string }[]) => ({
    ok: true,
    translations: new Map(items.map((i) => [i.id, `ع:${i.text}`])),
  }));
}

const sentTexts = () => mockTranslateBatch.mock.calls.flatMap(([items]) => (items as { text: string }[]).map((i) => i.text));

describe("saved translations (spec 032)", () => {
  let fixture: Awaited<ReturnType<typeof createFixtureWorkspace>>;
  let workspaceId: string;

  beforeEach(async () => {
    fixture = await createFixtureWorkspace();
    workspaceId = fixture.workspace.id;
    mockTranslateBatch.mockReset();
    fakeAi();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("translates each distinct entry once, saves it, and leaves codes and Arabic alone", async () => {
    const outcome = await translateTexts(workspaceId, ["Approve order", "Approve order", "PUR100", "قائم", " Finance "], "ar");
    expect(outcome.lookup("Approve order")).toBe("ع:Approve order");
    expect(outcome.lookup("Finance")).toBe("ع:Finance");
    expect(outcome.lookup("PUR100")).toBe("PUR100");
    expect(outcome.lookup("قائم")).toBe("قائم");
    expect(outcome).toMatchObject({ untranslated: 0, failure: null });
    expect(sentTexts().sort()).toEqual(["Approve order", "Finance"]);
    expect(await prisma.contentTranslation.count({ where: { workspaceId } })).toBe(2);
  });

  it("reuses saved translations without asking the AI again", async () => {
    await translateTexts(workspaceId, ["Approve order"], "ar");
    mockTranslateBatch.mockClear();
    const again = await translateTexts(workspaceId, ["Approve order"], "ar");
    expect(again.lookup("Approve order")).toBe("ع:Approve order");
    expect(mockTranslateBatch).not.toHaveBeenCalled();
  });

  it("translates an edited entry afresh, and only that one", async () => {
    await translateTexts(workspaceId, ["Approve order", "Pay invoice"], "ar");
    mockTranslateBatch.mockClear();
    const after = await translateTexts(workspaceId, ["Approve purchase order", "Pay invoice"], "ar");
    expect(sentTexts()).toEqual(["Approve purchase order"]);
    expect(after.lookup("Approve purchase order")).toBe("ع:Approve purchase order");
  });

  it("never overwrites a translation corrected by hand", async () => {
    await prisma.contentTranslation.create({
      data: {
        workspaceId,
        locale: "ar",
        sourceHash: sourceHash("Finance"),
        sourceText: "Finance",
        text: "الإدارة المالية",
        origin: "MANUAL",
      },
    });
    const outcome = await translateTexts(workspaceId, ["Finance"], "ar");
    expect(outcome.lookup("Finance")).toBe("الإدارة المالية");
    expect(mockTranslateBatch).not.toHaveBeenCalled();
  });

  it("keeps one workspace's translations away from another's", async () => {
    const other = await createFixtureWorkspace();
    try {
      await translateTexts(other.workspace.id, ["Finance"], "ar");
      await prisma.contentTranslation.updateMany({ where: { workspaceId: other.workspace.id }, data: { text: "سري" } });
      mockTranslateBatch.mockClear();
      const mine = await translateTexts(workspaceId, ["Finance"], "ar");
      expect(mine.lookup("Finance")).toBe("ع:Finance");
      expect(mockTranslateBatch).toHaveBeenCalledTimes(1);
    } finally {
      await other.cleanup();
    }
  });

  it("falls back to the text as typed, and says why, when the AI isn't available", async () => {
    mockTranslateBatch.mockResolvedValue({ ok: false, reason: "NOT_CONFIGURED", message: "AI translation isn't configured." });
    const outcome = await translateTexts(workspaceId, ["Approve order", "Pay invoice"], "ar");
    expect(outcome.lookup("Approve order")).toBe("Approve order");
    expect(outcome).toMatchObject({ untranslated: 2, failure: "AI translation isn't configured." });
    expect(await prisma.contentTranslation.count({ where: { workspaceId } })).toBe(0);
  });

  it("keeps the batches that succeeded when one fails", async () => {
    const many = Array.from({ length: 130 }, (_, i) => `Step number ${i}`);
    let call = 0;
    mockTranslateBatch.mockImplementation(async (items: { id: string; text: string }[]) =>
      ++call === 2
        ? { ok: false, reason: "REQUEST_FAILED", message: "The model is overloaded." }
        : { ok: true, translations: new Map(items.map((i) => [i.id, `ع:${i.text}`])) }
    );
    const outcome = await translateTexts(workspaceId, many, "ar");
    expect(outcome.untranslated).toBeGreaterThan(0);
    expect(outcome.untranslated).toBeLessThan(130);
    expect(outcome.failure).toBe("The model is overloaded.");
    expect(await prisma.contentTranslation.count({ where: { workspaceId } })).toBe(130 - outcome.untranslated);
  });

  it("only reads saved rows when the AI is not allowed", async () => {
    await translateTexts(workspaceId, ["Finance"], "ar");
    mockTranslateBatch.mockClear();
    const outcome = await translateTexts(workspaceId, ["Finance", "Operations"], "ar", { allowAi: false });
    expect(mockTranslateBatch).not.toHaveBeenCalled();
    expect(outcome.untranslated).toBe(1);
    expect(outcome.lookup("Operations")).toBe("Operations");
  });

  it("stops starting AI requests when its time budget is spent, and says to call again", async () => {
    const many = Array.from({ length: 100 }, (_, i) => `Step number ${i}`);
    const none = await translateTexts(workspaceId, many, "ar", { budgetMs: 0 });
    expect(mockTranslateBatch).not.toHaveBeenCalled();
    expect(none).toMatchObject({ untranslated: 100, pending: true, failure: null });

    // A later call picks up where this one left off, and finishes.
    const rest = await translateTexts(workspaceId, many, "ar");
    expect(rest).toMatchObject({ untranslated: 0, pending: false });
    expect(await prisma.contentTranslation.count({ where: { workspaceId } })).toBe(100);
  });

  it("does not call a failure 'pending': there is nothing to wait for", async () => {
    mockTranslateBatch.mockResolvedValue({ ok: false, reason: "REQUEST_FAILED", message: "overloaded" });
    const outcome = await translateTexts(workspaceId, ["Approve order"], "ar");
    expect(outcome).toMatchObject({ untranslated: 1, pending: false, failureKind: "REQUEST_FAILED" });
  });

  it("does nothing at all for English", async () => {
    const outcome = await translateTexts(workspaceId, ["Finance"], "en");
    expect(outcome.lookup("Finance")).toBe("Finance");
    expect(mockTranslateBatch).not.toHaveBeenCalled();
  });
});
