import { describe, it, expect } from "vitest";
import {
  buildImportPlan,
  findHeaderRow,
  matchHeaders,
  parseDepartments,
} from "@/lib/domain/value-chain-import";

// The real sheet's shape: a title row, then the header, then activities.
const RHI_ROWS: string[][] = [
  ["RHI Integrated Value Chain Process", "", "", "", ""],
  ["Phase", "Step / Activity", "Primary Owner", "Supporting Departments", "Description / Integration"],
  ["Initiation", "RFQ Receipt", "Commercial", "-CEO", "Receive RFQ for all cases (except mining initially)."],
  ["Evaluation", "Technical Evaluation", "Technical Office", "-", "Evaluate the needs and technical requirements."],
  ["Proposal", "Pricing & Profitability", "Commercial", "Executive (CEO/Chairman)", "Determine pricing and profit margin."],
  ["Execution", "O&M", "O&M", "Procurement, HR", "Operations, spare parts via procurement."],
];

describe("matchHeaders", () => {
  it("finds each column by name, wherever it sits", () => {
    expect(matchHeaders(RHI_ROWS[1]!)).toEqual({ phase: 0, label: 1, owner: 2, support: 3, description: 4 });
  });

  it("matches columns in any order", () => {
    expect(matchHeaders(["Description", "Primary Owner", "Step / Activity", "Phase"])).toEqual({
      phase: 3,
      label: 2,
      owner: 1,
      support: -1,
      description: 0,
    });
  });

  it("prefers the longest matching header, so a vaguer alias can't claim a column", () => {
    // "Supporting Departments" contains "department", which is also an owner
    // alias — the owner column must still be the one actually called that.
    const match = matchHeaders(["Phase", "Activity", "Primary Owner", "Supporting Departments"])!;
    expect(match.owner).toBe(2);
    expect(match.support).toBe(3);
  });

  it("tolerates casing and stray whitespace", () => {
    expect(matchHeaders(["  PHASE  ", "step /  activity"])).toEqual({
      phase: 0,
      label: 1,
      owner: -1,
      support: -1,
      description: -1,
    });
  });

  it("rejects a table with no phase or no activity column", () => {
    expect(matchHeaders(["Owner", "Description"])).toBeNull();
    expect(matchHeaders(["Phase", "Owner"])).toBeNull();
  });
});

describe("findHeaderRow", () => {
  it("skips a title row above the header", () => {
    expect(findHeaderRow(RHI_ROWS)).toBe(1);
  });

  it("reports -1 when the sheet has no usable header", () => {
    expect(findHeaderRow([["some", "notes"], ["more", "notes"]])).toBe(-1);
  });
});

describe("parseDepartments", () => {
  it("splits on commas", () => {
    expect(parseDepartments("Procurement, HR")).toEqual(["Procurement", "HR"]);
  });

  it("reads a bare dash as nobody", () => {
    expect(parseDepartments("-")).toEqual([]);
    expect(parseDepartments("")).toEqual([]);
    expect(parseDepartments("   ")).toEqual([]);
  });

  it("strips a dash stuck to the front of a real name", () => {
    expect(parseDepartments("-CEO")).toEqual(["CEO"]);
    expect(parseDepartments("-Technical office ")).toEqual(["Technical office"]);
  });

  it("keeps a name with brackets and a slash inside it intact", () => {
    expect(parseDepartments("Executive (CEO/Chairman)")).toEqual(["Executive (CEO/Chairman)"]);
  });

  it("reads none and n/a as nobody", () => {
    expect(parseDepartments("None")).toEqual([]);
    expect(parseDepartments("N/A")).toEqual([]);
  });
});

describe("buildImportPlan", () => {
  it("reads the activities out of the real sheet", () => {
    const plan = buildImportPlan(RHI_ROWS);

    expect(plan.activities).toHaveLength(4);
    expect(plan.activities[0]).toEqual({
      phase: "Initiation",
      label: "RFQ Receipt",
      owner: "Commercial",
      support: ["CEO"],
      description: "Receive RFQ for all cases (except mining initially).",
      sourceRow: 3,
    });
    expect(plan.activities[1]!.support).toEqual([]);
    expect(plan.activities[3]!.support).toEqual(["Procurement", "HR"]);
  });

  it("keeps the phases in the order they first appear — that's the chain's sequence", () => {
    expect(buildImportPlan(RHI_ROWS).phases).toEqual(["Initiation", "Evaluation", "Proposal", "Execution"]);
  });

  it("treats one department spelled two ways as one, keeping the first spelling", () => {
    const plan = buildImportPlan([
      ["Phase", "Activity", "Primary Owner"],
      ["Evaluation", "Technical Evaluation", "Technical Office"],
      ["Evaluation", "Site visit", "Technical office"],
    ]);
    expect(plan.departments).toEqual(["Technical Office"]);
  });

  it("collects every department, whether it owns or supports, once each", () => {
    expect(buildImportPlan(RHI_ROWS).departments).toEqual([
      "Commercial",
      "CEO",
      "Technical Office",
      "Executive (CEO/Chairman)",
      "O&M",
      "Procurement",
      "HR",
    ]);
  });

  it("ignores blank rows without calling them problems", () => {
    const plan = buildImportPlan([...RHI_ROWS, ["", "", "", "", ""], ["  ", "", "", "", ""]]);
    expect(plan.activities).toHaveLength(4);
    expect(plan.skipped).toEqual([]);
  });

  it("reports a row it couldn't use, and which row it was", () => {
    const plan = buildImportPlan([...RHI_ROWS, ["Closure", "", "Finance", "", "no name"]]);
    expect(plan.activities).toHaveLength(4);
    expect(plan.skipped).toEqual([{ sourceRow: 7, reason: "No activity name." }]);
  });

  it("names the activity in a phase-less row, so it can be found and fixed", () => {
    const plan = buildImportPlan([...RHI_ROWS, ["", "Collection", "Finance", "", ""]]);
    expect(plan.skipped).toEqual([{ sourceRow: 7, reason: '"Collection" has no phase.' }]);
  });

  it("explains itself when the sheet has no header at all", () => {
    const plan = buildImportPlan([["free", "form"], ["workshop", "notes"]]);
    expect(plan.activities).toEqual([]);
    expect(plan.skipped[0]!.reason).toContain("No header row");
  });

  it("takes only the first name in an owner cell that lists several", () => {
    const plan = buildImportPlan([
      ["Phase", "Activity", "Primary Owner"],
      ["Closure", "Collection", "Head of Commercial, Finance"],
    ]);
    expect(plan.activities[0]!.owner).toBe("Head of Commercial");
  });
});
