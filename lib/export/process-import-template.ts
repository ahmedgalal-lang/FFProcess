import ExcelJS from "exceljs";
import {
  SHEETS,
  READ_ME_SHEET,
  FORMAT_VERSION,
  FORMAT_MARKER_LABEL,
  MAX_STEPS,
} from "@/lib/domain/process-import";

/**
 * The workbook a consultant downloads, fills in at a workshop and uploads back.
 *
 * Generated from the same `SHEETS` declaration the parser reads, so the columns
 * it writes and the columns the importer expects cannot drift apart — there is
 * only one list. The round-trip test closes the loop: the template as
 * downloaded, unedited, must import, which is the standing proof that the pair
 * still agree.
 */

const HEADER_FILL = "FFF1F5F9";
const NOTE_COLOUR = "FF64748B";
const TITLE_COLOUR = "FF0F172A";

/**
 * The worked example. Small enough to read at a glance and complete enough to
 * be a real process: a decision with two labelled branches, RACI on every step
 * with exactly one Accountable each, one money rule and one time rule, a KPI
 * and an external entity.
 */
const EXAMPLE = {
  process: [
    ["Process Name", "Purchase Requisition (example — overwrite this)"],
    ["Description", "How a requisition becomes an approved purchase order."],
    ["Purpose", "One accountable owner at every stage, and a spending limit that is written down."],
    ["In Scope", "Goods and services over £1,000\nRenewals of existing contracts"],
    ["Out of Scope", "Inter-company transfers\nPetty cash"],
  ],
  steps: [
    ["1", "START", "Requisition raised", "Requester", "", "Complete the requisition form\nAttach the specification", "The requirement is never recorded", "Yes"],
    ["2", "TASK", "Budget check", "Finance", "", "Confirm the budget line has room", "Committed spend exceeds budget", "No"],
    ["3", "DECISION", "Within spending limit?", "Manager", "", "", "An over-limit order is placed without sign-off", "No"],
    ["4", "TASK", "Director approval", "Director", "", "Review and approve or reject", "An over-limit order goes unapproved", "Yes"],
    ["5", "TASK", "Raise purchase order", "Buyer", "", "Issue the PO to the supplier", "The supplier has no order to work from", "No"],
    ["6", "END", "Order confirmed", "Buyer", "", "", "", "Yes"],
  ],
  connections: [
    ["Requisition raised", "Budget check", ""],
    ["Budget check", "Within spending limit?", ""],
    ["Within spending limit?", "Director approval", "No — over limit"],
    ["Within spending limit?", "Raise purchase order", "Yes — within limit"],
    ["Director approval", "Raise purchase order", ""],
    ["Raise purchase order", "Order confirmed", ""],
  ],
  raci: [
    ["Requisition raised", "Requester", "R"], ["Requisition raised", "Manager", "A"],
    ["Budget check", "Finance", "R"], ["Budget check", "Finance", "A"],
    ["Within spending limit?", "Manager", "R"], ["Within spending limit?", "Manager", "A"],
    ["Director approval", "Director", "R"], ["Director approval", "Director", "A"],
    ["Director approval", "Finance", "C"],
    ["Raise purchase order", "Buyer", "R"], ["Raise purchase order", "Manager", "A"],
    ["Order confirmed", "Buyer", "R"], ["Order confirmed", "Manager", "A"],
    ["Order confirmed", "Requester", "I"],
  ],
  authority: [
    ["Within spending limit?", "Money", "10000", "", "Greater than", "Approval", "Director", ""],
    ["Director approval", "Time", "", "3", "Greater than", "Escalation", "Finance", ""],
  ],
  kpis: [["Requisition to PO cycle time", "Under 5 working days", "Monthly"]],
  externalEntities: [["Supplier", "The organisation the purchase order is issued to"]],
};

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle" };
  });
}

/**
 * A sheet's purpose above its table, then the header, then what each column
 * accepts as a note row — so a consultant never has to remember a permitted
 * value or go looking for documentation (FR-004).
 */
function addTableSheet(
  workbook: ExcelJS.Workbook,
  declaration: { name: string; columns: readonly { label: string; accepts: string }[] },
  example: string[][]
): void {
  const sheet = workbook.addWorksheet(declaration.name);

  // Row 1 must be the header, because that is where the parser looks. The
  // purpose line therefore goes in the tab's own description rather than
  // above the table, where it would shift every row by one.
  const header = sheet.addRow(declaration.columns.map((c) => c.label));
  styleHeader(header);
  sheet.getRow(1).height = 20;

  for (const row of example) sheet.addRow(row);

  declaration.columns.forEach((column, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = Math.max(16, Math.min(44, column.label.length + 8, column.accepts.length / 2 + 12));
    // The accepted values live in the header cell's own comment, so they are
    // one hover away on the column a consultant is actually filling in.
    header.getCell(i + 1).note = `${column.label}\n\n${column.accepts}`;
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildProcessImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FFProcess";
  workbook.created = new Date();

  // --- Read Me -----------------------------------------------------------
  const readMe = workbook.addWorksheet(READ_ME_SHEET);
  readMe.getColumn(1).width = 30;
  readMe.getColumn(2).width = 96;

  // The marker first: the importer reads this to know the workbook is its own
  // template and of a version it still understands. Do not delete this row.
  const marker = readMe.addRow([FORMAT_MARKER_LABEL, FORMAT_VERSION]);
  marker.font = { bold: true };
  readMe.addRow(["Generated", new Date().toISOString().slice(0, 10)]);
  readMe.addRow([]);

  const title = readMe.addRow(["Building a process from this workbook"]);
  title.font = { bold: true, size: 14, color: { argb: TITLE_COLOUR } };
  readMe.addRow([]);
  for (const line of [
    "Fill in the sheets below and upload this file on the Processes page. The whole process is",
    "created in one go: its steps in their lanes, the connections between them, the RACI grid and",
    "the Authority Matrix.",
    "",
    "Nothing is created until you have seen a summary of what will happen and confirmed it. If",
    "anything in the file is wrong, nothing at all is written and every problem is listed with the",
    "sheet and row it is on.",
    "",
    "The example filled in below is a small complete process. Overwrite it with your own.",
    "",
    `A process can carry up to ${MAX_STEPS} steps. The process code is generated for you — there is no`,
    "column for one.",
    "",
    "Do not rename the sheets, reorder the columns, or delete the Template format row above.",
  ]) {
    const row = readMe.addRow([line]);
    row.getCell(1).font = { color: { argb: NOTE_COLOUR } };
  }
  readMe.addRow([]);

  const sheetsHeader = readMe.addRow(["Sheet", "What it is for, and what each column accepts"]);
  styleHeader(sheetsHeader);

  const purposes: Record<string, string> = {
    [SHEETS.process.name]: "The process itself: its name, what it is for, and what is in and out of scope.",
    [SHEETS.steps.name]: "One row per step, in the order the work happens.",
    [SHEETS.connections.name]: "Which step leads to which. A decision's branches carry a label.",
    [SHEETS.raci.name]: "One row per assignment. Every step you list here needs exactly one A and at least one R.",
    [SHEETS.authority.name]: "One row per rule. A step may carry several; they apply in the order written.",
    [SHEETS.kpis.name]: "What this process is measured on.",
    [SHEETS.externalEntities.name]: "Parties outside the organisation that the process involves.",
  };

  for (const declaration of Object.values(SHEETS)) {
    const entries = "columns" in declaration ? declaration.columns : declaration.fields;
    const row = readMe.addRow([declaration.name, purposes[declaration.name] ?? ""]);
    row.getCell(1).font = { bold: true };
    for (const entry of entries) {
      const line = readMe.addRow(["", `${entry.label} — ${entry.accepts}`]);
      line.getCell(2).font = { color: { argb: NOTE_COLOUR } };
      line.getCell(2).alignment = { indent: 1 };
    }
    readMe.addRow([]);
  }

  // --- Process (key/value, not a table) ----------------------------------
  const process = workbook.addWorksheet(SHEETS.process.name);
  process.getColumn(1).width = 22;
  process.getColumn(2).width = 76;
  for (const [i, field] of SHEETS.process.fields.entries()) {
    const example = EXAMPLE.process[i];
    const row = process.addRow([field.label, example?.[1] ?? ""]);
    row.getCell(1).font = { bold: true };
    row.getCell(1).note = `${field.label}\n\n${field.accepts}`;
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }

  // --- The tables --------------------------------------------------------
  addTableSheet(workbook, SHEETS.steps, EXAMPLE.steps);
  addTableSheet(workbook, SHEETS.connections, EXAMPLE.connections);
  addTableSheet(workbook, SHEETS.raci, EXAMPLE.raci);
  addTableSheet(workbook, SHEETS.authority, EXAMPLE.authority);
  addTableSheet(workbook, SHEETS.kpis, EXAMPLE.kpis);
  addTableSheet(workbook, SHEETS.externalEntities, EXAMPLE.externalEntities);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
