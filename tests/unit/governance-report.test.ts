import { describe, expect, it } from "vitest";
import { buildGovernanceReport, isGovernanceReportEmpty, type GovernanceReportInput } from "@/lib/domain/governance-report";

function input(over: Partial<GovernanceReportInput> = {}): GovernanceReportInput {
  return {
    aspects: [],
    assessments: [],
    risks: [],
    policies: [],
    roleNameById: new Map(),
    personNameById: new Map(),
    ...over,
  };
}

function risk(over: Partial<GovernanceReportInput["risks"][number]> = {}): GovernanceReportInput["risks"][number] {
  return {
    title: "A risk",
    description: "What could go wrong.",
    likelihood: "MEDIUM",
    impact: "MEDIUM",
    status: "OPEN",
    ownerRoleId: null,
    ownerPersonId: null,
    ...over,
  };
}

describe("buildGovernanceReport — risks", () => {
  it("carries each risk's derived level, the same banding the Risk Register uses", () => {
    const r = buildGovernanceReport(input({ risks: [risk({ likelihood: "HIGH", impact: "CRITICAL" }), risk({ likelihood: "LOW", impact: "LOW" })] }));
    expect(r.risks.map((x) => x.level)).toEqual(["HIGH", "LOW"]);
  });

  it("lists open risks before closed ones, then High to Low, then by title", () => {
    const r = buildGovernanceReport(
      input({
        risks: [
          risk({ title: "Closed but severe", likelihood: "HIGH", impact: "CRITICAL", status: "CLOSED" }),
          risk({ title: "Beta low", likelihood: "LOW", impact: "LOW" }),
          risk({ title: "Alpha low", likelihood: "LOW", impact: "LOW" }),
          risk({ title: "Severe", likelihood: "HIGH", impact: "HIGH", status: "MITIGATING" }),
        ],
      })
    );
    expect(r.risks.map((x) => x.title)).toEqual(["Severe", "Alpha low", "Beta low", "Closed but severe"]);
  });

  it("names the owner from its role or person, or leaves it null", () => {
    const r = buildGovernanceReport(
      input({
        risks: [
          risk({ title: "a", ownerRoleId: "role-1" }),
          risk({ title: "b", ownerPersonId: "person-1" }),
          risk({ title: "c" }),
          risk({ title: "d", ownerRoleId: "role-that-was-deleted" }),
        ],
        roleNameById: new Map([["role-1", "CFO"]]),
        personNameById: new Map([["person-1", "Jamie Lee"]]),
      })
    );
    expect(r.risks.map((x) => x.owner)).toEqual(["CFO", "Jamie Lee", null, null]);
  });
});

describe("buildGovernanceReport — policies", () => {
  it("lists every policy by title with its lifecycle status and effective date, never its body", () => {
    const effective = new Date("2026-06-01");
    const r = buildGovernanceReport(
      input({
        policies: [
          { title: "Whistleblower Policy", lifecycleStatus: "DRAFT", effectiveDate: null },
          { title: "Code of Conduct", lifecycleStatus: "PUBLISHED", effectiveDate: effective },
        ],
      })
    );
    expect(r.policies).toEqual([
      { title: "Code of Conduct", lifecycleStatus: "PUBLISHED", effectiveDate: effective },
      { title: "Whistleblower Policy", lifecycleStatus: "DRAFT", effectiveDate: null },
    ]);
    expect(Object.keys(r.policies[0]!)).not.toContain("body");
  });
});

describe("buildGovernanceReport — assessment summaries", () => {
  const aspects = [
    { id: "a1", name: "Board Structure" },
    { id: "a2", name: "Ethics Policy" },
    { id: "a3", name: "ESG" },
  ];

  it("labels each summary with its aspect, in the aspects' own order", () => {
    const r = buildGovernanceReport(
      input({
        aspects,
        assessments: [
          { aspectId: "a3", summary: "ESG summary." },
          { aspectId: "a1", summary: "Board summary." },
        ],
      })
    );
    expect(r.summaries).toEqual([
      { aspectName: "Board Structure", summary: "Board summary." },
      { aspectName: "ESG", summary: "ESG summary." },
    ]);
  });

  it("skips an aspect whose summary is blank — the shell a hand-added checklist item creates", () => {
    const r = buildGovernanceReport(input({ aspects, assessments: [{ aspectId: "a2", summary: "   " }] }));
    expect(r.summaries).toEqual([]);
  });
});

describe("isGovernanceReportEmpty", () => {
  it("is empty only when there are no summaries, risks, or policies", () => {
    expect(isGovernanceReportEmpty(buildGovernanceReport(input()))).toBe(true);
    expect(isGovernanceReportEmpty(buildGovernanceReport(input({ risks: [risk()] })))).toBe(false);
    expect(
      isGovernanceReportEmpty(
        buildGovernanceReport(input({ policies: [{ title: "P", lifecycleStatus: "DRAFT", effectiveDate: null }] }))
      )
    ).toBe(false);
    expect(
      isGovernanceReportEmpty(
        buildGovernanceReport(input({ aspects: [{ id: "a", name: "A" }], assessments: [{ aspectId: "a", summary: "S" }] }))
      )
    ).toBe(false);
  });

  it("lists every aspect in tab order with its governing policy, or none (spec 029)", () => {
    const report = buildGovernanceReport({
      aspects: [
        { id: "a1", name: "Board Structure" },
        { id: "a2", name: "ESG" },
      ],
      assessments: [],
      risks: [],
      policies: [
        { title: "Board Charter", lifecycleStatus: "PUBLISHED", effectiveDate: new Date("2026-01-15"), governsAspectId: "a1" },
        { title: "Supplier Code", lifecycleStatus: "DRAFT", effectiveDate: null, governsAspectId: null },
      ],
      roleNameById: new Map(),
      personNameById: new Map(),
    });
    expect(report.governing).toEqual([
      { aspectName: "Board Structure", policy: { title: "Board Charter", lifecycleStatus: "PUBLISHED", effectiveDate: new Date("2026-01-15") } },
      { aspectName: "ESG", policy: null },
    ]);
  });
});
