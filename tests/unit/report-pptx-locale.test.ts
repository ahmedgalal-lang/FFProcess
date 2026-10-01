import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReportPptx } from "@/lib/export/pptx/report-pptx";
import { resolveArrangement } from "@/lib/domain/report-arrangement";
import { applyReportTranslations } from "@/lib/reports/localize-report";
import { sampleReport } from "./fixtures/sample-report";

/** Every slide's XML in a deck, joined, via the system unzip. */
function slidesXml(buffer: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "deck-"));
  const file = join(dir, "deck.pptx");
  writeFileSync(file, buffer);
  return execFileSync("unzip", ["-p", file, "ppt/slides/*.xml"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

describe("the deck in a report language (spec 032)", () => {
  it("builds an Arabic deck right to left, with Arabic wording and translated entries", async () => {
    const data = applyReportTranslations(sampleReport(), "ar", (text) => (text === "Procure to Pay" ? "الشراء حتى الدفع" : text));
    const xml = slidesXml(await buildReportPptx(data, resolveArrangement(null), "ar"));
    expect(xml).toContain('rtl="1"');
    expect(xml).toContain("الشراء حتى الدفع");
    expect(xml).toContain("الملخص التنفيذي");
    expect(xml).toContain("PUR100");
    expect(xml).not.toContain("Executive Summary");
  });

  it("leaves the English deck as it was", async () => {
    const xml = slidesXml(await buildReportPptx(sampleReport(), resolveArrangement(null)));
    expect(xml).not.toContain('rtl="1"');
    expect(xml).toContain("Executive Summary");
    expect(xml).toContain("Procure to Pay");
  });
});
