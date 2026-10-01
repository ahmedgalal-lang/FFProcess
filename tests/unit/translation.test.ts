import { describe, expect, it } from "vitest";
import { isTranslatable, normalizeSource, sourceHash } from "@/lib/translation/translatable";
import { acceptTranslations, BATCH_MAX_CHARS, BATCH_MAX_ITEMS, planBatches } from "@/lib/translation/ai-translate";

describe("what is translated (spec 032)", () => {
  it("translates ordinary English entries", () => {
    expect(isTranslatable("Approve purchase order")).toBe(true);
    expect(isTranslatable("Finance Manager")).toBe(true);
    expect(isTranslatable("Above 50,000 USD requires CFO sign-off")).toBe(true);
  });

  it("keeps what stays as written", () => {
    expect(isTranslatable("")).toBe(false);
    expect(isTranslatable("   ")).toBe(false);
    expect(isTranslatable("اعتماد أمر الشراء")).toBe(false);
    expect(isTranslatable("Approve أمر")).toBe(false); // already part Arabic: typed by someone on purpose
    expect(isTranslatable("50,000")).toBe(false);
    expect(isTranslatable("PUR100")).toBe(false);
    expect(isTranslatable("FIN-2")).toBe(false);
    expect(isTranslatable("—")).toBe(false);
  });

  it("identifies text by its trimmed content", () => {
    expect(normalizeSource("  Approve \n")).toBe("Approve");
    expect(sourceHash("Approve")).toBe(sourceHash("  Approve  "));
    expect(sourceHash("Approve")).not.toBe(sourceHash("approve"));
    expect(sourceHash("Approve")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("translation batches", () => {
  it("caps items per batch", () => {
    const items = Array.from({ length: BATCH_MAX_ITEMS * 2 + 5 }, (_, i) => ({ id: String(i), text: "x" }));
    expect(planBatches(items).map((b) => b.length)).toEqual([BATCH_MAX_ITEMS, BATCH_MAX_ITEMS, 5]);
  });

  it("caps characters per batch, and gives an oversized item its own batch", () => {
    const big = "y".repeat(BATCH_MAX_CHARS + 10);
    const half = "z".repeat(BATCH_MAX_CHARS / 2);
    const batches = planBatches([
      { id: "a", text: half },
      { id: "b", text: half },
      { id: "c", text: "short" },
      { id: "d", text: big },
    ]);
    expect(batches.map((b) => b.map((i) => i.id))).toEqual([["a", "b"], ["c"], ["d"]]);
  });

  it("returns no batches for nothing", () => {
    expect(planBatches([])).toEqual([]);
  });
});

describe("accepting the AI's answers", () => {
  const sent = [
    { id: "1", text: "Approve purchase order" },
    { id: "2", text: "Finance Manager" },
    { id: "3", text: "Close" },
  ];

  it("keeps real translations, by id", () => {
    const got = acceptTranslations(sent, {
      translations: [
        { id: "2", text: " المدير المالي " },
        { id: "1", text: "اعتماد أمر الشراء" },
      ],
    });
    expect(got).toEqual(
      new Map([
        ["2", "المدير المالي"],
        ["1", "اعتماد أمر الشراء"],
      ])
    );
  });

  it("keeps text the AI deliberately left as written, such as a name", () => {
    expect(acceptTranslations(sent, { translations: [{ id: "2", text: "Finance Manager" }] })).toEqual(
      new Map([["2", "Finance Manager"]])
    );
  });

  it("drops unknown ids, empty text, and runaway output", () => {
    const got = acceptTranslations(sent, {
      translations: [
        { id: "9", text: "غريب" },
        { id: "1", text: "   " },
        { id: "3", text: "إغلاق ".repeat(100) },
        { id: 4, text: "x" },
        null,
      ],
    });
    expect(got.size).toBe(0);
  });

  it("survives a malformed reply", () => {
    expect(acceptTranslations(sent, null).size).toBe(0);
    expect(acceptTranslations(sent, { translations: "nope" }).size).toBe(0);
    expect(acceptTranslations(sent, []).size).toBe(0);
  });
});
