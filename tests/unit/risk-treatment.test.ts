import { describe, expect, it } from "vitest";
import { heatMapCells, isTreatmentActionOverdue, IMPACT_ORDER, LIKELIHOOD_ROWS } from "@/lib/domain/risk-treatment";
import { deriveRiskLevel } from "@/lib/domain/governance-risk";

type R = Parameters<typeof heatMapCells>[0][number];
const risk = (id: string, likelihood: R["likelihood"], impact: R["impact"], status: R["status"] = "OPEN"): R => ({
  id,
  likelihood,
  impact,
  status,
});

describe("heatMapCells", () => {
  it("has twelve cells, likelihood High to Low down the rows and impact Low to Critical across", () => {
    const cells = heatMapCells([]);
    expect(cells).toHaveLength(12);
    expect(LIKELIHOOD_ROWS).toEqual(["HIGH", "MEDIUM", "LOW"]);
    expect(IMPACT_ORDER).toEqual(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
    expect(cells.slice(0, 4).map((c) => [c.likelihood, c.impact])).toEqual([
      ["HIGH", "LOW"],
      ["HIGH", "MEDIUM"],
      ["HIGH", "HIGH"],
      ["HIGH", "CRITICAL"],
    ]);
  });

  it("counts each risk in its own cell and lists exactly the ones it counted", () => {
    const cells = heatMapCells([
      risk("a", "HIGH", "CRITICAL"),
      risk("b", "HIGH", "CRITICAL", "MITIGATING"),
      risk("c", "LOW", "LOW"),
    ]);
    const at = (l: string, i: string) => cells.find((c) => c.likelihood === l && c.impact === i)!;
    expect(at("HIGH", "CRITICAL")).toMatchObject({ count: 2, riskIds: ["a", "b"] });
    expect(at("LOW", "LOW")).toMatchObject({ count: 1, riskIds: ["c"] });
    expect(cells.reduce((n, c) => n + c.count, 0)).toBe(3);
  });

  it("leaves closed risks off the map", () => {
    const cells = heatMapCells([risk("a", "HIGH", "HIGH", "CLOSED")]);
    expect(cells.every((c) => c.count === 0)).toBe(true);
  });

  it("colours every cell by the same level the Risk Register derives", () => {
    for (const cell of heatMapCells([])) {
      expect(cell.level).toBe(deriveRiskLevel(cell.likelihood, cell.impact));
    }
  });
});

describe("isTreatmentActionOverdue", () => {
  const today = new Date("2026-09-28T12:00:00Z");

  it("is overdue when open and past its due date", () => {
    expect(isTreatmentActionOverdue(new Date("2026-09-27"), null, today)).toBe(true);
  });

  it("is never overdue once done, and not on or before its due day", () => {
    expect(isTreatmentActionOverdue(new Date("2026-09-27"), new Date("2026-09-28"), today)).toBe(false);
    expect(isTreatmentActionOverdue(new Date("2026-09-28"), null, today)).toBe(false);
    expect(isTreatmentActionOverdue(null, null, today)).toBe(false);
  });
});
