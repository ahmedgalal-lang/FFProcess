import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseWorkbook } from "@/lib/domain/process-import";
import { buildSampleWorkbook, SAMPLE_STEPS, SAMPLE_PROCESS_NAME } from "../fixtures/process-import-sample";

/** SC-002: the size of process this feature exists for. */
describe("a 22-step process", () => {
  it("parses clean, with everything on it", async () => {
    const buffer = await buildSampleWorkbook();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sheets: Record<string, string[][]> = {};
    for (const worksheet of workbook.worksheets) {
      const rows: string[][] = [];
      worksheet.eachRow({ includeEmpty: true }, (row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, column) => {
          cells[column - 1] = cell.value === null || cell.value === undefined ? "" : String(cell.value);
        });
        rows.push(Array.from(cells, (c) => c ?? ""));
      });
      sheets[worksheet.name] = rows;
    }

    const plan = parseWorkbook(sheets);
    expect(plan.problems).toEqual([]);
    expect(plan.process.name).toBe(SAMPLE_PROCESS_NAME);
    expect(plan.steps).toHaveLength(22);
    expect(plan.steps.map((s) => s.label)).toEqual(SAMPLE_STEPS.map((s) => s.label));
    expect(plan.connections).toHaveLength(21);
    expect(plan.raci).toHaveLength(66);
    expect(plan.authority).toHaveLength(4);
    expect(plan.roleNames).toHaveLength(7);
    expect(plan.personNames).toEqual(["Dana Reed"]);
    expect(plan.kpis).toHaveLength(2);
    expect(plan.externalEntities).toHaveLength(2);
  });
});
