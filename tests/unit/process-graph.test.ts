import { describe, expect, it } from "vitest";
import { validateConnections, type StepConnectionInput } from "@/lib/domain/process-graph";

describe("validateConnections", () => {
  it("accepts connections between steps that share the same process", () => {
    const stepProcessId = new Map([
      ["step-1", "proc-1"],
      ["step-2", "proc-1"],
    ]);
    const connections: StepConnectionInput[] = [{ fromStepId: "step-1", toStepId: "step-2" }];
    expect(validateConnections(connections, stepProcessId)).toEqual([]);
  });

  it("rejects a connection spanning two different processes", () => {
    const stepProcessId = new Map([
      ["step-1", "proc-1"],
      ["step-2", "proc-2"],
    ]);
    const connections: StepConnectionInput[] = [{ fromStepId: "step-1", toStepId: "step-2" }];
    expect(validateConnections(connections, stepProcessId)).toEqual([
      { type: "CROSS_PROCESS_CONNECTION", fromStepId: "step-1", toStepId: "step-2" },
    ]);
  });

  it("permits a cycle (rework loop) within the same process", () => {
    const stepProcessId = new Map([
      ["step-1", "proc-1"],
      ["step-2", "proc-1"],
      ["step-3", "proc-1"],
    ]);
    const connections: StepConnectionInput[] = [
      { fromStepId: "step-1", toStepId: "step-2" },
      { fromStepId: "step-2", toStepId: "step-3" },
      { fromStepId: "step-3", toStepId: "step-1" },
    ];
    expect(validateConnections(connections, stepProcessId)).toEqual([]);
  });

  it("rejects a connection referencing a step not in the map at all", () => {
    const stepProcessId = new Map([["step-1", "proc-1"]]);
    const connections: StepConnectionInput[] = [{ fromStepId: "step-1", toStepId: "step-missing" }];
    expect(validateConnections(connections, stepProcessId)).toEqual([
      { type: "UNKNOWN_STEP", fromStepId: "step-1", toStepId: "step-missing" },
    ]);
  });
});
