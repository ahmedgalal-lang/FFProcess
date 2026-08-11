import ExcelJS from "exceljs";
import type { RaciCode } from "@/lib/domain/raci-validation";

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
}): Promise<Buffer> {
  const { workspaceName, processCode, processName, roles, activities, status } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FFProcess";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("RACI Matrix");
  sheet.addRow([`${workspaceName} · ${processCode} · ${processName}`]);
  sheet.addRow([`Status: ${status}${status === "DRAFT" ? " — NOT FINAL" : ""}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(["Activity", ...roles.map((r) => r.name)]);
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
  decisionTypeName: string;
  rules: {
    approverLabel: string;
    maxThreshold: number;
    coApprovalAboveThreshold: number | null;
    coApproverLabel: string | null;
  }[];
}): Promise<Buffer> {
  const { workspaceName, decisionTypeName, rules } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FFProcess";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Authority Matrix");
  sheet.addRow([`${workspaceName} · ${decisionTypeName}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(["Approver", "Max Threshold", "Co-Approval Above", "Co-Approver"]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });

  const sorted = [...rules].sort((a, b) => a.maxThreshold - b.maxThreshold);
  for (const r of sorted) {
    sheet.addRow([r.approverLabel, r.maxThreshold, r.coApprovalAboveThreshold ?? "", r.coApproverLabel ?? ""]);
  }
  const highest = sorted.at(-1)?.maxThreshold ?? 0;
  const gapRow = sheet.addRow(["No rule defined", `> ${highest}`, "", ""]);
  gapRow.font = { color: { argb: "FFB91C1C" }, bold: true };

  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(2).numFmt = '"$"#,##0';
  sheet.getRow(1).font = { bold: true, size: 13 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
