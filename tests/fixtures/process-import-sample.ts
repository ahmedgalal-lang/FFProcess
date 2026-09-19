import ExcelJS from "exceljs";
import {
  SHEETS,
  READ_ME_SHEET,
  FORMAT_VERSION,
  FORMAT_MARKER_LABEL,
} from "@/lib/domain/process-import";

/**
 * A filled-in workbook of the size SC-002 is about: 22 steps across seven
 * roles, the shape of a real engagement rather than the six-step example the
 * template ships with.
 *
 * Exports a builder and runs no work on import, so a spec can import it
 * without executing anything.
 */
export const SAMPLE_PROCESS_NAME = "Tendering to closure (sample)";

const ROLES = [
  "Head of Commercial and Business Development",
  "Sector Owner",
  "Client",
  "Legal",
  "CEO",
  "Finance",
  "PM Manager",
] as const;

type Step = { label: string; role: (typeof ROLES)[number]; type?: "START" | "DECISION" | "END" };

export const SAMPLE_STEPS: Step[] = [
  { label: "RFQ received", role: ROLES[0], type: "START" },
  { label: "Evaluate the opportunity", role: ROLES[0], type: "DECISION" },
  { label: "Route to sector owner", role: ROLES[1] },
  { label: "Site visit and technical clarification", role: ROLES[1] },
  { label: "Cross-functional alignment", role: ROLES[1] },
  { label: "Costing proposal", role: ROLES[0] },
  { label: "CEO scenario review", role: ROLES[0] },
  { label: "Board meeting", role: ROLES[0] },
  { label: "Internal final review", role: ROLES[0] },
  { label: "Client negotiation", role: ROLES[0], type: "DECISION" },
  { label: "Letter of award", role: ROLES[2] },
  { label: "Contract drafting", role: ROLES[3] },
  { label: "Contract signature", role: ROLES[4] },
  { label: "Execution", role: ROLES[1] },
  { label: "Operations validation and needs evaluation", role: ROLES[1] },
  { label: "Interdepartmental interaction", role: ROLES[1] },
  { label: "Mobilization and PM assigning", role: ROLES[2] },
  { label: "Plan confirmation and status update", role: ROLES[1] },
  { label: "Client presentation", role: ROLES[1] },
  { label: "Invoicing", role: ROLES[5] },
  { label: "Payment and collection", role: ROLES[5] },
  { label: "Closure", role: ROLES[6], type: "END" },
];

/** Builds the workbook as bytes, exactly as a consultant's saved file would be. */
export async function buildSampleWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const readMe = workbook.addWorksheet(READ_ME_SHEET);
  readMe.addRow([FORMAT_MARKER_LABEL, FORMAT_VERSION]);

  const process = workbook.addWorksheet(SHEETS.process.name);
  process.addRow(["Process Name", SAMPLE_PROCESS_NAME]);
  process.addRow(["Description", "A 22-step engagement, the size this feature exists for."]);
  process.addRow(["Purpose", "Turn a request for quotation into a delivered, invoiced engagement."]);
  process.addRow(["In Scope", "Competitive tenders\nDirect awards"]);
  process.addRow(["Out of Scope", "Framework renewals"]);

  const steps = workbook.addWorksheet(SHEETS.steps.name);
  steps.addRow(SHEETS.steps.columns.map((c) => c.label));
  SAMPLE_STEPS.forEach((step, i) => {
    steps.addRow([
      String(i + 1),
      step.type ?? "TASK",
      step.label,
      step.role,
      "",
      i % 3 === 0 ? "Record the outcome\nNotify the next owner" : "",
      i % 4 === 0 ? "The engagement stalls without a named owner" : "",
      step.type ? "Yes" : "No",
    ]);
  });

  const connections = workbook.addWorksheet(SHEETS.connections.name);
  connections.addRow(SHEETS.connections.columns.map((c) => c.label));
  for (let i = 0; i < SAMPLE_STEPS.length - 1; i++) {
    const from = SAMPLE_STEPS[i]!;
    connections.addRow([
      from.label,
      SAMPLE_STEPS[i + 1]!.label,
      from.type === "DECISION" ? "Yes — proceed" : "",
    ]);
  }

  // Every step carries exactly one Accountable and at least one Responsible.
  const raci = workbook.addWorksheet(SHEETS.raci.name);
  raci.addRow(SHEETS.raci.columns.map((c) => c.label));
  for (const step of SAMPLE_STEPS) {
    raci.addRow([step.label, step.role, "R"]);
    raci.addRow([step.label, ROLES[4], "A"]);
    raci.addRow([step.label, ROLES[5], "C"]);
  }

  const authority = workbook.addWorksheet(SHEETS.authority.name);
  authority.addRow(SHEETS.authority.columns.map((c) => c.label));
  authority.addRow(["Evaluate the opportunity", "Money", "250000", "", "Greater than", "Approval", ROLES[4], ""]);
  authority.addRow(["Client negotiation", "Money", "500000", "", "Greater than", "Escalation", ROLES[4], ""]);
  authority.addRow(["Contract signature", "Time", "", "5", "Greater than", "Escalation", "", "Dana Reed"]);
  authority.addRow(["Payment and collection", "Time", "", "30", "Greater than", "Escalation", ROLES[5], ""]);

  const kpis = workbook.addWorksheet(SHEETS.kpis.name);
  kpis.addRow(SHEETS.kpis.columns.map((c) => c.label));
  kpis.addRow(["Bid-to-award cycle time", "Under 45 days", "Quarterly"]);
  kpis.addRow(["Win rate", "Above 30%", "Quarterly"]);

  const entities = workbook.addWorksheet(SHEETS.externalEntities.name);
  entities.addRow(SHEETS.externalEntities.columns.map((c) => c.label));
  entities.addRow(["Client", "The buying organisation"]);
  entities.addRow(["Subcontractor", "Delivers part of the scope"]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
