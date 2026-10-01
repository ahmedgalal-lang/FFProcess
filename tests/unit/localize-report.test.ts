import { describe, expect, it } from "vitest";
import { sampleReport } from "./fixtures/sample-report";
import { applyReportTranslations, collectReportTexts, mapReportText } from "@/lib/reports/localize-report";

const toArabic = (text: string) => `ع(${text})`;

describe("report localisation (spec 032)", () => {
  it("collects every entry, and leaves names, codes and built-in aspect names out", () => {
    const texts = collectReportTexts(sampleReport(), "ar");
    for (const t of ["Procure to Pay", "Approve order", "Check budget", "Finance Manager", "Supplier", "5 days", "Yes",
      "Above $50,000 needs Finance Manager approval.", "No KPIs added", "The board meets quarterly.", "Data Privacy", "Manufacturing"]) {
      expect(texts, t).toContain(t);
    }
    for (const t of ["Acme Industrial", "Forefront Consulting", "Sara Ahmed", "PUR100", "Board Structure", "#123456", "s1"]) {
      expect(texts, t).not.toContain(t);
    }
  });

  it("puts translations back into the same fields", () => {
    const out = applyReportTranslations(sampleReport(), "ar", toArabic);
    const p = out.processes[0]!;
    expect(p.name).toBe("ع(Procure to Pay)");
    expect(p.code).toBe("PUR100");
    expect(p.steps[0]!.label).toBe("ع(Approve order)");
    expect(p.steps[0]!.detailedAction).toEqual(["ع(Check budget)"]);
    expect(p.steps[0]!.assignedRole).toEqual({ id: "r1", name: "ع(Finance Manager)" });
    expect(p.combinedRows[0]!.raci).toEqual({ r1: "ACCOUNTABLE" });
    expect(p.combinedRows[0]!.ruleSentences).toEqual(["ع(Above $50,000 needs Finance Manager approval.)"]);
    expect(out.people[0]).toMatchObject({ name: "Sara Ahmed", roleNames: ["ع(Finance Manager)"] });
    expect(out.companyName).toBe("Acme Industrial");
  });

  it("uses the dictionary for built-in wording rather than the AI", () => {
    const out = applyReportTranslations(sampleReport(), "ar", toArabic);
    expect(out.governance.summaries[0]!.aspectName).toBe("هيكل مجلس الإدارة");
    expect(out.governance.governing[0]!.aspectName).toBe("ع(Data Privacy)");
    expect(out.processes[0]!.combinedRows[0]!.directionLabel).toBe("أكثر من");
    expect(out.processes[0]!.involvedRoles[0]!.duties[0]!.label).toBe("مُساءَل");
  });

  it("returns English untouched", () => {
    const data = sampleReport();
    expect(applyReportTranslations(data, "en", toArabic)).toBe(data);
  });

  it("does not change the data it was given", () => {
    const data = sampleReport();
    const before = JSON.stringify(data);
    mapReportText(data, (t) => t.toUpperCase());
    expect(JSON.stringify(data)).toBe(before);
  });
});
