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
  processCode: string;
  processName: string;
  rows: {
    id: string;
    label: string;
    unit: "MONEY" | "DAYS";
    threshold: number | null;
    approverLabel: string | null;
    coApprovalAboveThreshold: number | null;
    coApproverLabel: string | null;
  }[];
}): Promise<Buffer> {
  const { workspaceName, processCode, processName, rows } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FFProcess";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Authority Matrix");
  sheet.addRow([`${workspaceName} · ${processCode} · ${processName}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(["Task", "Threshold", "Approver", "Co-Approval Above", "Co-Approver"]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });

  for (const r of rows) {
    const thresholdLabel =
      r.threshold === null ? "" : r.unit === "MONEY" ? r.threshold : `${r.threshold} day${r.threshold === 1 ? "" : "s"}`;
    const coLabel =
      r.coApprovalAboveThreshold === null
        ? ""
        : r.unit === "MONEY"
          ? r.coApprovalAboveThreshold
          : `${r.coApprovalAboveThreshold} day${r.coApprovalAboveThreshold === 1 ? "" : "s"}`;
    sheet.addRow([r.label, thresholdLabel, r.approverLabel ?? "", coLabel, r.coApproverLabel ?? ""]);
  }

  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 22;
  sheet.getRow(1).font = { bold: true, size: 13 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
