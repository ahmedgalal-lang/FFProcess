import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildAuthorityWorkbook, buildRaciWorkbook } from "@/lib/export/xlsx";
import { RaciPdfDocument } from "@/lib/export/pdf/raci-pdf";
import { messagesFor } from "@/lib/i18n/messages";

const raci = {
  workspaceName: "Acme",
  processCode: "PUR100",
  processName: "الشراء حتى الدفع",
  roles: [{ id: "r1", name: "المدير المالي" }],
  activities: [{ id: "a1", name: "اعتماد أمر الشراء", assignments: { r1: "ACCOUNTABLE" as const } }],
  status: "DRAFT" as const,
};

async function readSheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets[0]!;
}

describe("spreadsheets in a report language (spec 032)", () => {
  it("opens an Arabic RACI sheet right to left, with Arabic headings and the RACI letters kept", async () => {
    const sheet = await readSheet(await buildRaciWorkbook({ ...raci, locale: "ar" }));
    expect(sheet.name).toBe("مصفوفة RACI");
    expect(sheet.views[0]?.rightToLeft).toBe(true);
    expect(sheet.getRow(2).getCell(1).value).toBe("الحالة: مسودة — غير نهائية");
    expect(sheet.getRow(4).values).toEqual([undefined, "النشاط", "المدير المالي"]);
    expect(sheet.getRow(5).values).toEqual([undefined, "اعتماد أمر الشراء", "A"]);
  });

  it("keeps the English sheet exactly as before", async () => {
    const sheet = await readSheet(await buildRaciWorkbook({ ...raci, processName: "Procure to Pay" }));
    expect(sheet.name).toBe("RACI Matrix");
    expect(sheet.views?.[0]?.rightToLeft).toBeFalsy();
    expect(sheet.getRow(2).getCell(1).value).toBe("Status: DRAFT — NOT FINAL");
    expect(sheet.getRow(4).getCell(1).value).toBe("Activity");
  });

  it("gives the authority sheet Arabic column headings", async () => {
    const sheet = await readSheet(
      await buildAuthorityWorkbook({ workspaceName: "Acme", processCode: "PUR100", processName: "س", rows: [], locale: "ar" })
    );
    const f = messagesFor("ar").report.files;
    expect(sheet.getRow(3).values).toEqual([undefined, f.task, f.turnsOn, f.value, f.direction, f.then, f.who, f.rule]);
    expect(sheet.views[0]?.rightToLeft).toBe(true);
  });
});

describe("PDFs in a report language", () => {
  it("renders an Arabic RACI PDF with the embedded Arabic font", async () => {
    const buffer = await renderToBuffer(RaciPdfDocument({ ...raci, issueCount: 1, generatedFor: "a@b.c", locale: "ar" }));
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.toString("latin1")).toContain("IBMPlexSansArabic");
  });

  it("renders the English PDF without it", async () => {
    const buffer = await renderToBuffer(
      RaciPdfDocument({ ...raci, processName: "Procure to Pay", roles: [{ id: "r1", name: "Finance" }], issueCount: 0, generatedFor: "a@b.c" })
    );
    expect(buffer.toString("latin1")).not.toContain("IBMPlexSansArabic");
  });
});
