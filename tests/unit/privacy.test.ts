import { describe, expect, it } from "vitest";
import { isDpiaRecommended, needsPriorConsultation, parseList } from "@/lib/domain/privacy";

describe("isDpiaRecommended", () => {
  it("recommends a DPIA for special-category processing without an approved one", () => {
    expect(isDpiaRecommended({ specialCategory: true, dpias: [] })).toBe(true);
    expect(isDpiaRecommended({ specialCategory: true, dpias: [{ status: "DRAFT" }] })).toBe(true);
  });

  it("stops recommending once any DPIA on it is approved", () => {
    expect(isDpiaRecommended({ specialCategory: true, dpias: [{ status: "DRAFT" }, { status: "APPROVED" }] })).toBe(false);
  });

  it("doesn't recommend one for ordinary processing", () => {
    expect(isDpiaRecommended({ specialCategory: false, dpias: [] })).toBe(false);
  });
});

describe("needsPriorConsultation", () => {
  it("flags only a High residual risk (GDPR Art. 36)", () => {
    expect(needsPriorConsultation({ residualRisk: "HIGH" })).toBe(true);
    expect(needsPriorConsultation({ residualRisk: "MEDIUM" })).toBe(false);
    expect(needsPriorConsultation({ residualRisk: "LOW" })).toBe(false);
  });
});

describe("parseList", () => {
  it("splits a comma-separated input, trimming and dropping blanks and repeats", () => {
    expect(parseList(" Employees, contractors ,, employees,Applicants ")).toEqual(["Employees", "contractors", "Applicants"]);
    expect(parseList("")).toEqual([]);
  });
});
