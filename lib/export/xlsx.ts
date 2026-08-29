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
    slaDays: number | null;
    threshold: number | null;
    directionLabel: string;
    approverLabel: string | null;
    coApprovalAboveThreshold: number | null;
    coApproverLabel: string | null;
    escalationLabel: string | null;
  }[];
}): Promise<Buffer> {
  const { workspaceName, processCode, processName, rows } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FFProcess";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Authority Matrix");
  sheet.addRow([`${workspaceName} · ${processCode} · ${processName}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    "Task",
    "SLA (days)",
    "Amount",
    "Direction",
    "Approver",
    "Co-Approval Above",
    "Co-Approver",
    "Escalation",
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  });

  for (const r of rows) {
    sheet.addRow([
      r.label,
      r.slaDays ?? "",
      r.threshold ?? "",
      r.directionLabel,
      r.approverLabel ?? "",
      r.coApprovalAboveThreshold ?? "",
      r.coApproverLabel ?? "",
      r.escalationLabel ?? "",
    ]);
  }

  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 11;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 22;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(7).width = 22;
  sheet.getColumn(8).width = 22;
  sheet.getRow(1).font = { bold: true, size: 13 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
