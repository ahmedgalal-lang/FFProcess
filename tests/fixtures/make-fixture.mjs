// Regenerates value-chain-sample.xlsx — the shape of a consultant's value-chain
// tab (a title row, a header, then activities), with invented content. Run with
// `node tests/fixtures/make-fixture.mjs` if the import's expectations change.
import ExcelJS from "exceljs";

const workbook = new ExcelJS.Workbook();

// A free-form notes tab first, so the importer has to *find* the right sheet
// rather than take the first one — which is what real workbooks look like.
const notes = workbook.addWorksheet("Workshop notes");
notes.addRow(["kick-off", "who owns pricing?"]);
notes.addRow(["follow up with finance"]);

const sheet = workbook.addWorksheet("Integrated Process Map");
sheet.addRow(["Sample Integrated Value Chain"]);
sheet.addRow(["Phase", "Step / Activity", "Primary Owner", "Supporting Departments", "Description / Integration"]);
sheet.addRow(["Initiation", "Enquiry Received", "Commercial", "-Executive", "Log the enquiry and confirm it is in scope."]);
sheet.addRow(["Evaluation", "Technical Review", "Technical Office", "-", "Assess what the work actually requires."]);
sheet.addRow(["Proposal", "Pricing", "Commercial", "Executive, Finance", "Set the price and the margin."]);
sheet.addRow(["Delivery", "Mobilisation", "Operations", "Procurement, HR", "Stand the team and the kit up on site."]);
sheet.addRow(["Closure", "Final Invoice", "Finance", "Commercial", "Invoice, then chase to settlement."]);
// A row with no activity name, so the preview's "skipped" path has something
// real to report.
sheet.addRow(["Closure", "", "Finance", "", "left over from an older draft"]);

await workbook.xlsx.writeFile(new URL("./value-chain-sample.xlsx", import.meta.url).pathname);
console.log("wrote tests/fixtures/value-chain-sample.xlsx");
