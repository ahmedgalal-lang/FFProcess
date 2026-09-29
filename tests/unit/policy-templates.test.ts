import { describe, expect, it } from "vitest";
import { POLICY_TEMPLATES, fillTemplate, rankTemplates } from "@/lib/domain/policy-templates";
import { DEFAULT_GOVERNANCE_ASPECT_NAMES } from "@/lib/domain/governance-focus-areas";

describe("POLICY_TEMPLATES", () => {
  it("holds 14 templates with unique ids and titles and a real, sectioned body", () => {
    expect(POLICY_TEMPLATES).toHaveLength(14);
    expect(new Set(POLICY_TEMPLATES.map((t) => t.id)).size).toBe(14);
    expect(new Set(POLICY_TEMPLATES.map((t) => t.title)).size).toBe(14);
    for (const t of POLICY_TEMPLATES) {
      expect(t.body).toMatch(/^1\. Purpose/m);
      expect(t.body).toMatch(/Roles and responsibilities/);
      expect(t.body).toMatch(/Monitoring and review/);
      expect(t.body.length).toBeGreaterThan(900);
    }
  });

  it("covers the topics of the removed registers", () => {
    const titles = POLICY_TEMPLATES.map((t) => t.title);
    for (const title of [
      "Conflict of Interest Policy",
      "Whistleblowing Policy",
      "Anti-Bribery and Corruption Policy",
      "Third-Party Management Policy",
      "Incident Management Policy",
      "Data Protection Policy",
      "Training and Awareness Policy",
    ]) {
      expect(titles).toContain(title);
    }
  });
});

describe("rankTemplates", () => {
  it("puts the matching template first for every default aspect", () => {
    const expected: Record<string, string> = {
      "Board Structure": "Board Charter",
      "Risk & Internal Controls": "Risk Management Policy",
      "Ethics Policy": "Code of Ethics and Conduct",
      Compensation: "Remuneration Policy",
      ESG: "Sustainability (ESG) Policy",
      "Data Integrity": "Data Governance Policy",
      Accessibility: "Accessibility Policy",
    };
    for (const name of DEFAULT_GOVERNANCE_ASPECT_NAMES) {
      const ranked = rankTemplates(name);
      expect(ranked[0]!.template.title).toBe(expected[name]);
      expect(ranked[0]!.suggested).toBe(true);
      expect(ranked.filter((r) => r.suggested)).toHaveLength(1);
    }
  });

  it("matches a custom aspect by keyword, ignoring case", () => {
    expect(rankTemplates("Conflicts of Interest")[0]!.template.title).toBe("Conflict of Interest Policy");
    expect(rankTemplates("data privacy")[0]!.template.title).toBe("Data Protection Policy");
    expect(rankTemplates("Supplier Management")[0]!.template.title).toBe("Third-Party Management Policy");
    expect(rankTemplates("Speak-up")[0]!.template.title).toBe("Whistleblowing Policy");
  });

  it("returns the whole catalogue, in order, with nothing suggested for an aspect nothing matches", () => {
    const ranked = rankTemplates("Quarterly Offsite");
    expect(ranked.map((r) => r.template.id)).toEqual(POLICY_TEMPLATES.map((t) => t.id));
    expect(ranked.some((r) => r.suggested)).toBe(false);
  });
});

describe("fillTemplate", () => {
  it("puts the company's name in place of every placeholder", () => {
    const filled = fillTemplate(POLICY_TEMPLATES[0]!, "Acme Industrial");
    expect(filled.body).not.toContain("{{company}}");
    expect(filled.body).toContain("Acme Industrial");
    expect(filled.title).toBe(POLICY_TEMPLATES[0]!.title);
  });
});
