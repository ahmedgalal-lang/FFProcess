import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildProcessImportTemplate } from "@/lib/export/process-import-template";
import {
  parseWorkbook,
  SHEETS,
  REQUIRED_SHEETS,
  READ_ME_SHEET,
  FORMAT_VERSION,
  FORMAT_MARKER_LABEL,
} from "@/lib/domain/process-import";

/**
 * The standing proof that the generator and the parser still agree.
 *
 * They are built from one shared SHEETS declaration precisely so they cannot
 * drift, but a shared declaration only constrains the column *names* — it
 * cannot stop the example rows being written in an order the parser rejects,
 * or a permitted value being spelled one way in the template and read another.
 * If this test ever fails, every other test in this feature can still pass
 * while the product is broken for every real consultant: the file they
 * download is not the file the importer accepts.
 */
async function readGeneratedTemplate(): Promise<Record<string, string[][]>> {
  const buffer = await buildProcessImportTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheets: Record<string, string[][]> = {};
  for (const worksheet of workbook.worksheets) {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        const value = cell.value;
        cells[column - 1] =
          value === null || value === undefined
            ? ""
            : typeof value === "object" && "richText" in value
              ? value.richText.map((t) => t.text).join("")
              : String(value);
      });
      rows.push(Array.from(cells, (cell) => cell ?? ""));
    });
    sheets[worksheet.name] = rows;
  }
  return sheets;
}

describe("the template the product hands out", () => {
  it("carries every sheet the importer requires", async () => {
    const sheets = await readGeneratedTemplate();
    for (const name of REQUIRED_SHEETS) {
      expect(Object.keys(sheets), `missing sheet "${name}"`).toContain(name);
    }
  });

  it("states its own format version where the importer looks for it", async () => {
    const sheets = await readGeneratedTemplate();
    const marker = (sheets[READ_ME_SHEET] ?? []).find((row) => row[0] === FORMAT_MARKER_LABEL);
    expect(marker?.[1]).toBe(FORMAT_VERSION);
  });

  it("writes each table's headers exactly as the parser reads them", async () => {
    const sheets = await readGeneratedTemplate();
    for (const declaration of Object.values(SHEETS)) {
      if (!("columns" in declaration)) continue;
      expect(sheets[declaration.name]?.[0], declaration.name).toEqual(
        declaration.columns.map((c) => c.label)
      );
    }
  });

  it("states what every column accepts, somewhere a consultant will find it", async () => {
    const sheets = await readGeneratedTemplate();
    const readMe = (sheets[READ_ME_SHEET] ?? []).flat().join("\n");
    for (const declaration of Object.values(SHEETS)) {
      const entries = "columns" in declaration ? declaration.columns : declaration.fields;
      for (const entry of entries) {
        expect(readMe, `${declaration.name} · ${entry.label}`).toContain(entry.accepts);
      }
    }
  });

  it("states the permitted values rather than leaving them to be remembered", async () => {
    const sheets = await readGeneratedTemplate();
    const readMe = (sheets[READ_ME_SHEET] ?? []).flat().join("\n");
    for (const value of [
      "START, TASK, DECISION or END",
      "R, A, C or I",
      "Money, Time or None",
      "Approval or Escalation",
      "No approval required",
    ]) {
      expect(readMe).toContain(value);
    }
  });

  it("never invites a process code, which the system generates", async () => {
    const sheets = await readGeneratedTemplate();
    const processLabels = (sheets[SHEETS.process.name] ?? []).map((r) => (r[0] ?? "").toLowerCase());
    expect(processLabels.some((l) => l.includes("code"))).toBe(false);
    expect((sheets[SHEETS.steps.name]?.[0] ?? []).join(" ").toLowerCase()).not.toContain("code");
  });
});

describe("the round trip", () => {
  it("imports the template as downloaded, with nothing edited", async () => {
    const plan = parseWorkbook(await readGeneratedTemplate());
    // The assertion that matters: not that it parsed, but that it parsed clean.
    expect(plan.problems).toEqual([]);
  });

  it("reads the worked example as a small complete process", async () => {
    const plan = parseWorkbook(await readGeneratedTemplate());

    expect(plan.process.name).toBeTruthy();
    expect(plan.process.inScope.length).toBeGreaterThan(0);
    expect(plan.process.outOfScope.length).toBeGreaterThan(0);

    // A real shape, not a single row: a start, an end, and a decision.
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    expect(plan.steps.map((s) => s.type)).toContain("START");
    expect(plan.steps.map((s) => s.type)).toContain("END");
    expect(plan.steps.map((s) => s.type)).toContain("DECISION");

    // The decision's branches are labelled — the thing a reader needs to tell
    // them apart, and the thing a template that omitted it would teach people
    // to omit too.
    const decision = plan.steps.find((s) => s.type === "DECISION")!;
    const branches = plan.connections.filter((c) => c.fromLabel === decision.label);
    expect(branches.length).toBeGreaterThanOrEqual(2);
    expect(branches.every((b) => b.label !== null)).toBe(true);

    // RACI on every step, and both kinds of authority rule.
    const stepsWithRaci = new Set(plan.raci.map((r) => r.stepLabel));
    expect(stepsWithRaci.size).toBe(plan.steps.length);
    expect(plan.authority.map((r) => r.measure)).toContain("MONEY");
    expect(plan.authority.map((r) => r.measure)).toContain("TIME");

    expect(plan.kpis.length).toBeGreaterThan(0);
    expect(plan.externalEntities.length).toBeGreaterThan(0);
    expect(plan.roleNames.length).toBeGreaterThan(1);
  });

  it("names every role it uses, so the summary can say which are new", async () => {
    const plan = parseWorkbook(await readGeneratedTemplate());
    const used = new Set(
      [
        ...plan.steps.flatMap((s) => [s.assignedRole, s.swimlaneRole]),
        ...plan.raci.map((r) => r.roleName),
        ...plan.authority.map((r) => r.whoRole),
      ].filter((n): n is string => !!n)
    );
    for (const name of used) {
      expect(
        plan.roleNames.some((r) => r.toLowerCase() === name.toLowerCase()),
        `"${name}" was used but not collected`
      ).toBe(true);
    }
  });
});
