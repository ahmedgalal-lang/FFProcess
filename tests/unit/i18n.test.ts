import { describe, expect, it } from "vitest";
import { messagesFor } from "@/lib/i18n/messages";
import { dirFor, formatDate, isLocale, withAnswerLanguage } from "@/lib/i18n/locale";
import { POLICY_TEMPLATES, findTemplate, rankTemplates } from "@/lib/domain/policy-templates";
import { POLICY_TEMPLATES_AR } from "@/lib/domain/policy-templates.ar";
import { SECTION_GUIDES, sectionGuideFor, type SectionGuideId } from "@/lib/domain/section-guides";

const ARABIC = /[؀-ۿ]/;

/** Every leaf of a dictionary, as [path, value]. Functions are called with sample arguments. */
function leaves(node: unknown, path = ""): [string, unknown][] {
  if (typeof node === "function") return [[path, node]];
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => leaves(value, path ? `${path}.${key}` : key));
  }
  return [[path, node]];
}

describe("interface dictionaries (spec 031)", () => {
  const en = leaves(messagesFor("en"));
  const ar = new Map(leaves(messagesFor("ar")));

  it("Arabic has every key English has, of the same kind", () => {
    for (const [path, value] of en) {
      expect(ar.has(path), path).toBe(true);
      expect(typeof ar.get(path), path).toBe(typeof value);
    }
    expect(ar.size).toBe(en.length);
  });

  it("every Arabic string is actually in Arabic", () => {
    // Names that stay as they are: ESG in Arabic business usage, and each
    // language named in itself on the switcher.
    const sameInBoth = new Set(["governance.aspectNames.ESG", "language.english"]);
    for (const [path, value] of ar) {
      if (typeof value !== "string" || sameInBoth.has(path)) continue;
      expect(value, path).toMatch(ARABIC);
    }
  });

  it("Arabic message functions produce Arabic text", () => {
    for (const [path, value] of ar) {
      if (typeof value !== "function") continue;
      const out = (value as (...args: unknown[]) => unknown)("س", 2, "ص", "ع");
      expect(String(out), path).toMatch(ARABIC);
    }
  });
});

describe("locale helpers", () => {
  it("recognises the two languages and their direction", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });

  it("formats Arabic dates with Western digits", () => {
    const text = formatDate(new Date(Date.UTC(2026, 2, 12, 12)), "ar");
    expect(text).toMatch(ARABIC);
    expect(text).toContain("2026");
  });

  it("leaves English AI prompts untouched and asks for Arabic otherwise", () => {
    expect(withAnswerLanguage("Prompt", "en")).toBe("Prompt");
    const ar = withAnswerLanguage("Prompt", "ar");
    expect(ar.startsWith("Prompt")).toBe(true);
    expect(ar).toContain("Modern Standard Arabic");
  });
});

describe("Arabic policy templates", () => {
  it("every template has an Arabic version with the same structure", () => {
    for (const template of POLICY_TEMPLATES) {
      expect(POLICY_TEMPLATES_AR[template.id], template.id).toBeDefined();
      const ar = findTemplate(template.id, "ar")!;
      expect(ar.id).toBe(template.id);
      expect(ar.title).toMatch(ARABIC);
      expect(ar.body).toContain("{{company}}");
      for (const heading of ["1. الغرض", "4. بنود السياسة", "7. الاعتماد وضبط الإصدارات"]) {
        expect(ar.body, template.id).toContain(heading);
      }
    }
    expect(Object.keys(POLICY_TEMPLATES_AR).sort()).toEqual(POLICY_TEMPLATES.map((t) => t.id).sort());
  });

  it("suggests the same template in either language", () => {
    expect(rankTemplates("Board Structure", "ar")[0]).toMatchObject({ suggested: true, template: { id: "board-charter" } });
    expect(rankTemplates("Board Structure", "ar")[0]!.template.title).toBe("ميثاق مجلس الإدارة");
    expect(rankTemplates("Board Structure")[0]!.template.title).toBe("Board Charter");
  });

  it("finds a template for an aspect named in Arabic", () => {
    expect(rankTemplates("خصوصية البيانات", "ar")[0]).toMatchObject({ suggested: true, template: { id: "data-protection" } });
  });
});

describe("Arabic section guides", () => {
  it("covers every guide, with the same number of steps", () => {
    for (const id of Object.keys(SECTION_GUIDES) as SectionGuideId[]) {
      const en = sectionGuideFor(id, "en");
      const ar = sectionGuideFor(id, "ar");
      expect(ar.title, id).toMatch(ARABIC);
      expect(ar.how.length, id).toBe(en.how.length);
      expect(ar.why.length, id).toBe(en.why.length);
      expect(Boolean(ar.ref), id).toBe(Boolean(en.ref));
    }
  });
});
