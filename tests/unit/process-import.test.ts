import { describe, it, expect } from "vitest";
import { parseWorkbook } from "@/lib/domain/process-import";
import { workbook } from "../fixtures/process-import-workbook";

/** Three steps, one owner each, enough to hang connections and RACI off. */
const THREE_STEPS = [
  ["1", "START", "Receive request", "Buyer", "", "Log it\nAcknowledge", "Request is lost", "Yes"],
  ["2", "DECISION", "Approve?", "Manager", "", "", "", ""],
  ["3", "END", "Close", "Buyer", "", "", "", "No"],
];

/** Every step gets exactly one A and at least one R, which is the product's rule. */
const FULL_RACI = [
  ["Receive request", "Buyer", "R"],
  ["Receive request", "Manager", "A"],
  ["Approve?", "Manager", "A"],
  ["Approve?", "Buyer", "R"],
  ["Close", "Buyer", "R"],
  ["Close", "Manager", "A"],
];

describe("parsing a filled-in template", () => {
  it("reads the process's own fields, splitting the multi-line ones", () => {
    const plan = parseWorkbook(
      workbook({
        process: [
          ["Process Name", "Tendering to closure"],
          ["Description", "How a bid becomes a contract."],
          ["Purpose", "One accountable owner per stage."],
          ["In Scope", "Bids over £50k\nRenewals"],
          ["Out of Scope", "Internal transfers"],
        ],
        steps: THREE_STEPS,
        raci: FULL_RACI,
      })
    );
    expect(plan.problems).toEqual([]);
    expect(plan.process.name).toBe("Tendering to closure");
    expect(plan.process.description).toBe("How a bid becomes a contract.");
    expect(plan.process.processPurpose).toBe("One accountable owner per stage.");
    expect(plan.process.inScope).toEqual(["Bids over £50k", "Renewals"]);
    expect(plan.process.outOfScope).toEqual(["Internal transfers"]);
  });

  it("reads the steps in order, with their type, owner and documentation", () => {
    const plan = parseWorkbook(workbook({ steps: THREE_STEPS, raci: FULL_RACI }));
    expect(plan.problems).toEqual([]);
    expect(plan.steps.map((s) => s.label)).toEqual(["Receive request", "Approve?", "Close"]);
    expect(plan.steps.map((s) => s.type)).toEqual(["START", "DECISION", "END"]);
    expect(plan.steps[0]!.detailedAction).toEqual(["Log it", "Acknowledge"]);
    expect(plan.steps[0]!.exceptionHandling).toBe("Request is lost");
    expect(plan.steps.map((s) => s.milestone)).toEqual([true, false, false]);
  });

  it("orders by the Order column, not by the row the line happens to sit on", () => {
    const plan = parseWorkbook(
      workbook({
        steps: [
          ["3", "END", "Close", "Buyer", "", "", "", ""],
          ["1", "START", "Receive request", "Buyer", "", "", "", ""],
          ["2", "TASK", "Review", "Buyer", "", "", "", ""],
        ],
        raci: [
          ["Close", "Buyer", "R"], ["Close", "Manager", "A"],
          ["Receive request", "Buyer", "R"], ["Receive request", "Manager", "A"],
          ["Review", "Buyer", "R"], ["Review", "Manager", "A"],
        ],
      })
    );
    expect(plan.problems).toEqual([]);
    expect(plan.steps.map((s) => s.label)).toEqual(["Receive request", "Review", "Close"]);
  });

  it("falls back to the swimlane's assigned role when the lane column is blank", () => {
    const plan = parseWorkbook(workbook({ steps: THREE_STEPS, raci: FULL_RACI }));
    expect(plan.steps[0]!.assignedRole).toBe("Buyer");
    expect(plan.steps[0]!.swimlaneRole).toBe("Buyer");
  });

  it("keeps an explicit swimlane that differs from the assignee", () => {
    const plan = parseWorkbook(
      workbook({
        steps: [["1", "TASK", "Draft", "Legal", "Buyer", "", "", ""]],
        raci: [["Draft", "Legal", "A"], ["Draft", "Buyer", "R"]],
      })
    );
    expect(plan.steps[0]!.assignedRole).toBe("Legal");
    expect(plan.steps[0]!.swimlaneRole).toBe("Buyer");
  });

  it("reads connections with their branch labels", () => {
    const plan = parseWorkbook(
      workbook({
        steps: THREE_STEPS,
        raci: FULL_RACI,
        connections: [
          ["Receive request", "Approve?", ""],
          ["Approve?", "Close", "Yes"],
        ],
      })
    );
    expect(plan.problems).toEqual([]);
    expect(plan.connections).toHaveLength(2);
    expect(plan.connections[1]).toMatchObject({ fromLabel: "Approve?", toLabel: "Close", label: "Yes" });
    expect(plan.connections[0]!.label).toBeNull();
  });

  it("reads a RACI letter per role per step", () => {
    const plan = parseWorkbook(workbook({ steps: THREE_STEPS, raci: FULL_RACI }));
    expect(plan.problems).toEqual([]);
    expect(plan.raci).toHaveLength(6);
    expect(plan.raci[0]).toMatchObject({ stepLabel: "Receive request", roleName: "Buyer", code: "RESPONSIBLE" });
    expect(plan.raci[1]!.code).toBe("ACCOUNTABLE");
  });

  it("reads both kinds of authority rule, with who carries each", () => {
    const plan = parseWorkbook(
      workbook({
        steps: THREE_STEPS,
        raci: FULL_RACI,
        authority: [
          ["Approve?", "Money", "50000", "", "Greater than", "Approval", "Manager", ""],
          ["Approve?", "Time", "", "5", "Greater than or equal", "Escalation", "", "Dana Reed"],
        ],
      })
    );
    expect(plan.problems).toEqual([]);
    expect(plan.authority[0]).toMatchObject({
      measure: "MONEY", amount: 50000, days: null,
      direction: "GREATER_THAN", consequence: "APPROVAL", whoRole: "Manager", whoPerson: null,
    });
    expect(plan.authority[1]).toMatchObject({
      measure: "TIME", amount: null, days: 5,
      direction: "GREATER_OR_EQUAL", consequence: "ESCALATION", whoRole: null, whoPerson: "Dana Reed",
    });
    // Rules on one step keep their sheet order, which is their display order.
    expect(plan.authority.map((r) => r.order)).toEqual([0, 1]);
  });

  it("reads KPIs and external entities", () => {
    const plan = parseWorkbook(
      workbook({
        steps: THREE_STEPS,
        raci: FULL_RACI,
        kpis: [["Cycle time", "< 10 days", "Monthly"]],
        externalEntities: [["Client", "The buying organisation"]],
      })
    );
    expect(plan.problems).toEqual([]);
    expect(plan.kpis[0]).toMatchObject({ metric: "Cycle time", target: "< 10 days", frequency: "Monthly" });
    expect(plan.externalEntities[0]).toMatchObject({ name: "Client", description: "The buying organisation" });
  });

  it("ignores blank rows rather than reading them as empty steps", () => {
    const plan = parseWorkbook(
      workbook({ steps: [...THREE_STEPS, ["", "", "", "", "", "", "", ""], ["", "", ""]], raci: FULL_RACI })
    );
    expect(plan.problems).toEqual([]);
    expect(plan.steps).toHaveLength(3);
  });
});

describe("matching names to what the workspace already has", () => {
  it("collects every distinct role named anywhere in the file", () => {
    const plan = parseWorkbook(
      workbook({
        steps: [["1", "TASK", "Draft", "Legal", "Buyer", "", "", ""]],
        raci: [["Draft", "Legal", "A"], ["Draft", "Reviewer", "R"]],
        authority: [["Draft", "Money", "100", "", "Greater than", "Approval", "Finance", ""]],
      })
    );
    expect(plan.roleNames.sort()).toEqual(["Buyer", "Finance", "Legal", "Reviewer"]);
  });

  it("treats one role spelled two ways as one role, keeping the first spelling", () => {
    // A sheet routinely spells the same team "Sector Owner" in one cell and
    // "SECTOR OWNER" in the next; importing both would create two roles.
    const plan = parseWorkbook(
      workbook({
        steps: [
          ["1", "TASK", "Draft", "Sector Owner", "", "", "", ""],
          ["2", "TASK", "Review", "SECTOR OWNER", "", "", "", ""],
        ],
        raci: [
          ["Draft", "sector owner", "A"], ["Draft", "Buyer", "R"],
          ["Review", "Sector Owner", "A"], ["Review", "Buyer", "R"],
        ],
      })
    );
    expect(plan.roleNames).toEqual(["Sector Owner", "Buyer"]);
  });

  it("collects people only from the column that names one", () => {
    const plan = parseWorkbook(
      workbook({
        steps: [["1", "TASK", "Draft", "Legal", "", "", "", ""]],
        raci: [["Draft", "Legal", "A"], ["Draft", "Buyer", "R"]],
        authority: [
          ["Draft", "Money", "100", "", "Greater than", "Approval", "", "Dana Reed"],
          ["Draft", "Time", "", "3", "Less than", "Escalation", "", "dana reed"],
        ],
      })
    );
    expect(plan.personNames).toEqual(["Dana Reed"]);
    expect(plan.roleNames).not.toContain("Dana Reed");
  });
});
