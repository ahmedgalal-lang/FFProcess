import { describe, it, expect } from "vitest";
import { parseWorkbook, SHEETS, READ_ME_SHEET, FORMAT_MARKER_LABEL } from "@/lib/domain/process-import";
import { workbook } from "../fixtures/process-import-workbook";

/**
 * Every one of these asserts the *location* as well as the complaint. A
 * message that says a task has two Accountables without saying which row to
 * change sends a consultant hunting through a 22-step workbook, which is the
 * thing SC-004 exists to prevent.
 */
function problemAt(plan: ReturnType<typeof parseWorkbook>, sheet: string, row: number) {
  return plan.problems.find((p) => p.source.sheet === sheet && p.source.row === row);
}

const OK_RACI = (label: string) => [
  [label, "Buyer", "R"],
  [label, "Manager", "A"],
];

describe("a file that is not this template", () => {
  it("is refused when a sheet is missing, naming the sheet", () => {
    const sheets = workbook({ steps: [["1", "TASK", "Draft", "Buyer", "", "", "", ""]] });
    delete sheets[SHEETS.authority.name];
    const plan = parseWorkbook(sheets);
    expect(plan.steps).toEqual([]);
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]!.message).toContain(`"${SHEETS.authority.name}"`);
    expect(plan.problems[0]!.message).toMatch(/not the process import template/i);
  });

  it("is refused when it is not a template at all", () => {
    const plan = parseWorkbook({ "Sheet1": [["some", "notes"]] });
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]!.message).toMatch(/not the process import template/i);
  });

  it("refuses a template from an older release by name instead of reading it", () => {
    const sheets = workbook({
      steps: [["1", "TASK", "Draft", "Buyer", "", "", "", ""]],
      readMe: [[FORMAT_MARKER_LABEL, "process-import v0"]],
    });
    const plan = parseWorkbook(sheets);
    expect(plan.steps).toEqual([]);
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]!.source.sheet).toBe(READ_ME_SHEET);
    expect(plan.problems[0]!.message).toContain("process-import v0");
    expect(plan.problems[0]!.message).toContain("process-import v1");
  });

  it("refuses a workbook that carries no version marker", () => {
    const sheets = workbook({ steps: [["1", "TASK", "Draft", "Buyer", "", "", "", ""]], readMe: [["", ""]] });
    const plan = parseWorkbook(sheets);
    expect(plan.problems[0]!.message).toMatch(/does not say which template version/i);
  });
});

describe("an empty template", () => {
  it("is reported as empty, not imported as a nameless process", () => {
    const plan = parseWorkbook(workbook({ process: [["Process Name", ""]] }));
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]!.message).toMatch(/empty/i);
  });

  it("with a name but no steps says so", () => {
    const plan = parseWorkbook(workbook({ process: [["Process Name", "Tendering"]] }));
    expect(problemAt(plan, SHEETS.steps.name, 2)?.message).toMatch(/no steps/i);
  });
});

describe("mistakes in the steps sheet", () => {
  it("names the row of a step with no name", () => {
    const plan = parseWorkbook(workbook({ steps: [["1", "TASK", "", "Buyer", "", "", "", ""]] }));
    expect(problemAt(plan, SHEETS.steps.name, 2)?.message).toMatch(/no step name/i);
  });

  it("names the row of an unrecognised step type, and what is allowed", () => {
    const plan = parseWorkbook(workbook({ steps: [["1", "STAGE", "Draft", "Buyer", "", "", "", ""]] }));
    const problem = problemAt(plan, SHEETS.steps.name, 2);
    expect(problem?.message).toContain("STAGE");
    expect(problem?.message).toContain("START, TASK, DECISION or END");
  });

  it("refuses two steps with the same name, naming both rows", () => {
    const plan = parseWorkbook(
      workbook({
        steps: [
          ["1", "TASK", "Review", "Buyer", "", "", "", ""],
          ["2", "TASK", "Review", "Manager", "", "", "", ""],
        ],
      })
    );
    // Reported on the second one, pointing back at the first.
    const problem = problemAt(plan, SHEETS.steps.name, 3);
    expect(problem?.message).toContain('"Review"');
    expect(problem?.message).toContain("row 2");
    expect(plan.steps).toHaveLength(1);
  });

  it("refuses a process larger than can be imported at once", () => {
    const steps = Array.from({ length: 301 }, (_, i) => ["" + (i + 1), "TASK", `Step ${i + 1}`, "Buyer", "", "", "", ""]);
    const plan = parseWorkbook(workbook({ steps }));
    expect(problemAt(plan, SHEETS.steps.name, 1)?.message).toMatch(/301 steps.*most.*300/i);
  });
});

describe("a reference to a step that is not in the file", () => {
  it("is reported against the connection's own row", () => {
    const plan = parseWorkbook(
      workbook({
        steps: [["1", "TASK", "Draft", "Buyer", "", "", "", ""]],
        raci: OK_RACI("Draft"),
        connections: [["Draft", "Signature", ""]],
      })
    );
    const problem = problemAt(plan, SHEETS.connections.name, 2);
    expect(problem?.message).toContain('"Signature"');
    expect(problem?.message).toMatch(/nothing to join to/i);
  });

  it("is reported against the RACI row", () => {
    const plan = parseWorkbook(
      workbook({
        steps: [["1", "TASK", "Draft", "Buyer", "", "", "", ""]],
        raci: [...OK_RACI("Draft"), ["Ghost step", "Buyer", "R"]],
      })
    );
    expect(problemAt(plan, SHEETS.raci.name, 4)?.message).toContain('"Ghost step"');
  });

  it("is reported against the authority row", () => {
    const plan = parseWorkbook(
      workbook({
        steps: [["1", "TASK", "Draft", "Buyer", "", "", "", ""]],
        raci: OK_RACI("Draft"),
        authority: [["Ghost step", "Money", "100", "", "Greater than", "Approval", "Manager", ""]],
      })
    );
    expect(problemAt(plan, SHEETS.authority.name, 2)?.message).toContain('"Ghost step"');
  });
});

describe("the product's own RACI rule, enforced here too", () => {
  const oneStep = [["1", "TASK", "Draft", "Buyer", "", "", "", ""]];

  it("reports a task with two Accountables", () => {
    const plan = parseWorkbook(
      workbook({
        steps: oneStep,
        raci: [["Draft", "Buyer", "A"], ["Draft", "Manager", "A"], ["Draft", "Legal", "R"]],
      })
    );
    const problem = problemAt(plan, SHEETS.steps.name, 2);
    expect(problem?.message).toContain('"Draft"');
    expect(problem?.message).toMatch(/more than one Accountable/i);
  });

  it("reports a task with no Accountable", () => {
    const plan = parseWorkbook(workbook({ steps: oneStep, raci: [["Draft", "Buyer", "R"]] }));
    expect(problemAt(plan, SHEETS.steps.name, 2)?.message).toMatch(/exactly one Accountable.*none/i);
  });

  it("reports a task with no Responsible", () => {
    const plan = parseWorkbook(workbook({ steps: oneStep, raci: [["Draft", "Buyer", "A"]] }));
    expect(problemAt(plan, SHEETS.steps.name, 2)?.message).toMatch(/at least one Responsible/i);
  });

  it("names the row of a letter that is not R, A, C or I", () => {
    const plan = parseWorkbook(workbook({ steps: oneStep, raci: [["Draft", "Buyer", "X"]] }));
    const problem = problemAt(plan, SHEETS.raci.name, 2);
    expect(problem?.message).toContain('"X"');
    expect(problem?.message).toContain("R, A, C or I");
  });

  it("leaves a step nobody gave a letter to alone — that is a skipped step, not a broken one", () => {
    const plan = parseWorkbook(workbook({ steps: oneStep }));
    expect(plan.problems).toEqual([]);
  });
});

describe("the product's own authority rules, enforced here too", () => {
  const oneStep = [["1", "TASK", "Draft", "Buyer", "", "", "", ""]];

  it("reports a money rule with no figure", () => {
    const plan = parseWorkbook(
      workbook({
        steps: oneStep, raci: OK_RACI("Draft"),
        authority: [["Draft", "Money", "", "", "Greater than", "Approval", "Manager", ""]],
      })
    );
    expect(plan.problems.some((p) => /no figure/i.test(p.message))).toBe(true);
    expect(plan.problems.every((p) => p.source.row > 0)).toBe(true);
  });

  it("reports a rule with nobody to carry it", () => {
    const plan = parseWorkbook(
      workbook({
        steps: oneStep, raci: OK_RACI("Draft"),
        authority: [["Draft", "Money", "5000", "", "Greater than", "Approval", "", ""]],
      })
    );
    expect(plan.problems.some((p) => /nobody to carry it/i.test(p.message))).toBe(true);
  });

  it("refuses a rule naming both a role and a person, on its own row", () => {
    const plan = parseWorkbook(
      workbook({
        steps: oneStep, raci: OK_RACI("Draft"),
        authority: [["Draft", "Money", "5000", "", "Greater than", "Approval", "Manager", "Dana Reed"]],
      })
    );
    const problem = problemAt(plan, SHEETS.authority.name, 2);
    expect(problem?.message).toContain("Manager");
    expect(problem?.message).toContain("Dana Reed");
  });

  it("names the row of an unrecognised direction, and what is allowed", () => {
    const plan = parseWorkbook(
      workbook({
        steps: oneStep, raci: OK_RACI("Draft"),
        authority: [["Draft", "Money", "5000", "", "Above", "Approval", "Manager", ""]],
      })
    );
    const problem = problemAt(plan, SHEETS.authority.name, 2);
    expect(problem?.message).toContain('"Above"');
    expect(problem?.message).toMatch(/Greater than/);
  });

  it("lets a rule that says no approval is required stand without a figure or a who", () => {
    const plan = parseWorkbook(
      workbook({
        steps: oneStep, raci: OK_RACI("Draft"),
        authority: [["Draft", "None", "", "", "No approval required", "", "", ""]],
      })
    );
    expect(plan.problems).toEqual([]);
  });
});

describe("every problem, whatever it is", () => {
  it("carries a real sheet and a real row", () => {
    const plan = parseWorkbook(
      workbook({
        process: [["Process Name", "Broken"]],
        steps: [
          ["1", "STAGE", "Draft", "Buyer", "", "", "", ""],
          ["2", "TASK", "Review", "Buyer", "", "", "", ""],
          ["3", "TASK", "Review", "Manager", "", "", "", ""],
        ],
        raci: [["Review", "Buyer", "A"], ["Review", "Manager", "A"], ["Ghost", "Buyer", "R"]],
        connections: [["Review", "Nowhere", ""]],
        authority: [["Review", "Money", "", "", "Greater than", "Approval", "", ""]],
      })
    );
    expect(plan.problems.length).toBeGreaterThan(4);
    for (const problem of plan.problems) {
      expect(problem.source.sheet, problem.message).toBeTruthy();
      expect(problem.source.row, problem.message).toBeGreaterThan(0);
      expect(problem.message.length, "a message a consultant can act on").toBeGreaterThan(15);
    }
  });

  it("is listed in the order a consultant works through the workbook", () => {
    const plan = parseWorkbook(
      workbook({
        steps: [["1", "TASK", "Draft", "Buyer", "", "", "", ""]],
        raci: [["Draft", "Buyer", "X"]],
        authority: [["Ghost", "Money", "1", "", "Greater than", "Approval", "Manager", ""]],
      })
    );
    const sheets = plan.problems.map((p) => p.source.sheet);
    expect(sheets.indexOf(SHEETS.raci.name)).toBeLessThan(sheets.indexOf(SHEETS.authority.name));
  });
});
