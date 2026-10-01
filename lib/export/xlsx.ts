import ExcelJS from "exceljs";
import type { RaciCode } from "@/lib/domain/raci-validation";
import type { Locale } from "@/lib/i18n/locale";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * A sheet in its language (spec 032): an Arabic sheet opens right to left,
 * so its first column is on the right as an Arabic reader expects.
 */
function addSheet(workbook: ExcelJS.Workbook, name: string, locale: Locale) {
  return workbook.addWorksheet(name, locale === "ar" ? { views: [{ rightToLeft: true }] } : undefined);
}

const CODE_LETTER: Record<RaciCode, string> = {
  RESPONSIBLE: "R",
  ACCOUNTABLE: "A",
  CONSULTED: "C",
  INFORMED: "I",
};

export async function buildRaciWorkbook(params: {
  workspaceName: string;
  processCode: string;
  processName: string;
  roles: { id: string; name: string }[];
  activities: { id: string; name: string; assignments: Record<string, RaciCode | undefined> }[];
  status: "DRAFT" | "FINAL";
  /** The file's language (spec 032); English when not given. */
  locale?: Locale;
}): Promise<Buffer> {
  const { workspaceName, processCode, processName, roles, activities, status, locale = "en" } = params;
  const f = messagesFor(locale).report.files;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FFProcess";
  workbook.created = new Date();

  const sheet = addSheet(workbook, f.raciTitle, locale);
  sheet.addRow([`${workspaceName} · ${processCode} · ${processName}`]);
  sheet.addRow([`${f.status(f.statuses[status] ?? status)}${status === "DRAFT" ? f.notFinal : ""}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow([f.activity, ...roles.map((r) => r.name)]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });

  for (const activity of activities) {
    sheet.addRow([
      activity.name,
      ...roles.map((r) => {
        const code = activity.assignments[r.id];
        return code ? CODE_LETTER[code] : "";
      }),
    ]);
  }

  sheet.getColumn(1).width = 32;
  roles.forEach((_, i) => (sheet.getColumn(i + 2).width = 16));
  sheet.getRow(1).font = { bold: true, size: 13 };
  sheet.getRow(2).font = { italic: true, color: { argb: status === "DRAFT" ? "FFB45309" : "FF15803D" } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildAuthorityWorkbook(params: {
  workspaceName: string;
  processCode: string;
  processName: string;
  rows: {
    id: string;
    label: string;
    turnsOn: string;
    value: string;
    directionLabel: string;
    thenLabel: string;
    whoLabel: string;
    sentence: string;
  }[];
  /** The file's language (spec 032); English when not given. */
  locale?: Locale;
}): Promise<Buffer> {
  const { workspaceName, processCode, processName, rows, locale = "en" } = params;
  const f = messagesFor(locale).report.files;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FFProcess";
  workbook.created = new Date();

  const sheet = addSheet(workbook, f.authorityTitle, locale);
  sheet.addRow([`${workspaceName} · ${processCode} · ${processName}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow([f.task, f.turnsOn, f.value, f.direction, f.then, f.who, f.rule]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });

  for (const r of rows) {
    sheet.addRow([r.label, r.turnsOn, r.value, r.directionLabel, r.thenLabel, r.whoLabel, r.sentence]);
  }

  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 11;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(6).width = 22;
  sheet.getColumn(7).width = 62;
  sheet.getRow(1).font = { bold: true, size: 13 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
