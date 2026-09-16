import { describe, expect, it } from "vitest";
import { summariseDeleteImpact, type ProcessDeleteCounts } from "@/lib/domain/process-delete-impact";

const PROCESS = { code: "PUR101", name: "Purchase-to-Pay" };

const NOTHING: ProcessDeleteCounts = {
  stepCount: 0,
  raciAssignmentCount: 0,
  authorityRuleCount: 0,
  kpiCount: 0,
  subProcessCount: 0,
  branchingCount: 0,
};

const counts = (over: Partial<ProcessDeleteCounts>): ProcessDeleteCounts => ({ ...NOTHING, ...over });

describe("summariseDeleteImpact — is the process empty?", () => {
  it("reports an untouched process as empty", () => {
    const impact = summariseDeleteImpact(PROCESS, NOTHING);
    expect(impact.isEmpty).toBe(true);
    expect(impact.carries).toEqual([]);
  });

  it("is not empty when it holds only KPIs", () => {
    // KPIs live on the process row rather than under a step, so a process with
    // no map at all can still carry recorded work worth warning about.
    expect(summariseDeleteImpact(PROCESS, counts({ kpiCount: 3 })).isEmpty).toBe(false);
  });

  it("is not empty when it holds only authority rules", () => {
    expect(summariseDeleteImpact(PROCESS, counts({ authorityRuleCount: 1 })).isEmpty).toBe(false);
  });

  it("stays empty when the only thing it has is sub-processes", () => {
    // Sub-processes are not attached work — they survive the deletion. An empty
    // process with children is still an empty process, and the confirmation
    // must be able to say both things at once.
    const impact = summariseDeleteImpact(PROCESS, counts({ subProcessCount: 2 }));
    expect(impact.isEmpty).toBe(true);
    expect(impact.leavesBehind).toHaveLength(1);
  });
});

describe("summariseDeleteImpact — what it carries", () => {
  it("lists every kind of attached work, in a fixed order", () => {
    const impact = summariseDeleteImpact(
      PROCESS,
      counts({ stepCount: 14, raciAssignmentCount: 26, authorityRuleCount: 4, kpiCount: 2 })
    );
    expect(impact.carries).toEqual(["14 steps", "26 RACI assignments", "4 authority rules", "2 KPIs"]);
  });

  it("omits the kinds that are absent rather than printing zeroes", () => {
    expect(summariseDeleteImpact(PROCESS, counts({ stepCount: 6 })).carries).toEqual(["6 steps"]);
  });

  it("uses the singular for exactly one", () => {
    const impact = summariseDeleteImpact(
      PROCESS,
      counts({ stepCount: 1, raciAssignmentCount: 1, authorityRuleCount: 1, kpiCount: 1 })
    );
    expect(impact.carries).toEqual(["1 step", "1 RACI assignment", "1 authority rule", "1 KPI"]);
  });
});

describe("summariseDeleteImpact — what it leaves behind", () => {
  it("says nothing when nothing points at the process", () => {
    expect(summariseDeleteImpact(PROCESS, counts({ stepCount: 5 })).leavesBehind).toEqual([]);
  });

  it("warns about sub-processes left without a parent", () => {
    const [sentence] = summariseDeleteImpact(PROCESS, counts({ subProcessCount: 2 })).leavesBehind;
    expect(sentence).toContain("2 sub-processes");
    expect(sentence).toContain("without a parent");
  });

  it("warns about processes that branch from its steps", () => {
    const [sentence] = summariseDeleteImpact(PROCESS, counts({ branchingCount: 1 })).leavesBehind;
    expect(sentence).toContain("1 process");
    expect(sentence).toContain("starting point");
  });

  it("warns about both, separately, when both apply", () => {
    expect(
      summariseDeleteImpact(PROCESS, counts({ subProcessCount: 3, branchingCount: 2 })).leavesBehind
    ).toHaveLength(2);
  });

  it("carries the identity through so the dialog can name the process", () => {
    const impact = summariseDeleteImpact(PROCESS, NOTHING);
    expect(impact.code).toBe("PUR101");
    expect(impact.name).toBe("Purchase-to-Pay");
  });
});
