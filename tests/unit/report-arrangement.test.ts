import { describe, expect, it } from "vitest";
import {
  ARRANGEMENT_VERSION,
  BLOCKS,
  PROCESS_SECTIONS,
  isBlockEmpty,
  isSectionEmpty,
  resolveArrangement,
  type StoredArrangement,
} from "@/lib/domain/report-arrangement";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const on = (xs: { id: string; on: boolean }[]) => xs.filter((x) => x.on).map((x) => x.id);

/** A stored arrangement that matches the catalogue exactly, to vary from. */
function stored(over: Partial<StoredArrangement> = {}): StoredArrangement {
  return {
    version: ARRANGEMENT_VERSION,
    pack: [],
    sections: PROCESS_SECTIONS.map((s) => ({ id: s.id, on: true })),
    blocks: BLOCKS.map((b) => ({ id: b.id, on: true, sec: b.defaultSection })),
    ...over,
  };
}

describe("resolveArrangement — falling back", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "not an arrangement"],
    ["an array", []],
    ["an object missing its arrays", { version: ARRANGEMENT_VERSION }],
    // The payload has to *differ* from the default, or the assertion passes
    // whether or not the version is checked — which is how the first draft of
    // this test let a "accept any version" mutation through.
    [
      "a version from a later release",
      { version: 99, pack: [], sections: [{ id: "raci", on: true }], blocks: [] },
    ],
  ])("gives the default arrangement for %s", (_label, value) => {
    const r = resolveArrangement(value);
    expect(ids(r.sections)).toEqual(PROCESS_SECTIONS.map((s) => s.id));
    expect(r.sections.every((s) => s.on)).toBe(true);
    expect(r.pack.every((s) => s.on)).toBe(true);
  });

  it("never throws, whatever it is handed", () => {
    // Every caller is rendering a document someone is waiting for.
    for (const value of [NaN, () => {}, Symbol("x"), { version: 1, pack: 3 }, new Date()]) {
      expect(() => resolveArrangement(value)).not.toThrow();
    }
  });
});

describe("resolveArrangement — merging with the catalogue", () => {
  it("honours the stored order", () => {
    const r = resolveArrangement(
      stored({ sections: [{ id: "raci", on: true }, { id: "exec", on: true }] })
    );
    expect(ids(r.sections).slice(0, 2)).toEqual(["raci", "exec"]);
  });

  it("drops ids the catalogue no longer knows", () => {
    const r = resolveArrangement(
      stored({ sections: [{ id: "a-section-we-removed", on: true }, { id: "raci", on: true }] })
    );
    expect(ids(r.sections)).not.toContain("a-section-we-removed");
    expect(ids(r.sections)).toHaveLength(PROCESS_SECTIONS.length);
  });

  it("appends catalogue entries the stored value never mentions, INCLUDED", () => {
    // The failure this guards: a section added after a client was arranged
    // would otherwise be hidden from that client forever, with no error.
    const r = resolveArrangement(stored({ sections: [{ id: "raci", on: true }] }));
    expect(ids(r.sections)).toEqual(["raci", "exec", "map", "gov"]);
    expect(on(r.sections)).toContain("gov");
  });

  it("does the same for blocks", () => {
    const r = resolveArrangement(stored({ blocks: [{ id: "kpis", on: true, sec: "gov" }] }));
    const all = r.sections.flatMap((s) => s.blocks);
    expect(ids(all)).toHaveLength(BLOCKS.length);
    expect(all.find((b) => b.id === "purpose")?.on).toBe(true);
  });

  it("ignores a repeated id rather than printing it twice", () => {
    const r = resolveArrangement(
      stored({ sections: [{ id: "raci", on: true }, { id: "raci", on: false }] })
    );
    expect(ids(r.sections).filter((id) => id === "raci")).toHaveLength(1);
  });

  it("keeps a block whose stored section no longer exists, under its default", () => {
    const r = resolveArrangement(stored({ blocks: [{ id: "kpis", on: true, sec: "gone" }] }));
    expect(ids(r.sections.find((s) => s.id === "gov")!.blocks)).toContain("kpis");
  });

  it("includes the cover page however the stored value is shaped", () => {
    const r = resolveArrangement(stored({ pack: [{ id: "cover", on: false }] }));
    expect(r.pack.find((s) => s.id === "cover")!.on).toBe(true);
  });
});

describe("resolveArrangement — pinned blocks", () => {
  it("keeps the authority rules immediately after the RACI grid", () => {
    const r = resolveArrangement(stored());
    const raci = r.sections.find((s) => s.id === "raci")!;
    expect(ids(raci.blocks)).toEqual(["raciGrid", "rules"]);
  });

  it("pulls them back together when the stored value separated them", () => {
    const r = resolveArrangement(
      stored({
        blocks: [
          { id: "raciGrid", on: true, sec: "raci" },
          { id: "kpis", on: true, sec: "raci" },
          { id: "rules", on: true, sec: "raci" },
        ],
      })
    );
    const raci = r.sections.find((s) => s.id === "raci")!;
    expect(ids(raci.blocks).indexOf("rules")).toBe(ids(raci.blocks).indexOf("raciGrid") + 1);
  });

  it("drags the rules into whichever section the grid moved to", () => {
    const r = resolveArrangement(
      stored({
        blocks: [
          { id: "raciGrid", on: true, sec: "gov" },
          { id: "rules", on: true, sec: "raci" },
        ],
      })
    );
    expect(ids(r.sections.find((s) => s.id === "raci")!.blocks)).not.toContain("rules");
    const gov = ids(r.sections.find((s) => s.id === "gov")!.blocks);
    expect(gov.indexOf("rules")).toBe(gov.indexOf("raciGrid") + 1);
  });
});

describe("resolveArrangement — numbering", () => {
  it("numbers included sections N.0 in order", () => {
    const r = resolveArrangement(stored());
    expect(r.sections.map((s) => s.number)).toEqual(["1.0", "2.0", "3.0", "4.0"]);
  });

  it("numbers blocks N.M under their section", () => {
    const r = resolveArrangement(stored());
    const exec = r.sections.find((s) => s.id === "exec")!;
    expect(exec.blocks.map((b) => b.number)).toEqual(["1.1", "1.2", "1.3", "1.4"]);
  });

  it("closes the gap when a section is excluded", () => {
    const r = resolveArrangement(
      stored({
        sections: [
          { id: "exec", on: false },
          { id: "map", on: true },
          { id: "raci", on: true },
          { id: "gov", on: true },
        ],
      })
    );
    expect(r.sections.map((s) => s.number)).toEqual([null, "1.0", "2.0", "3.0"]);
    expect(r.sections.find((s) => s.id === "map")!.blocks.map((b) => b.number)).toEqual([
      "1.1",
      "1.2",
      "1.3",
    ]);
  });

  it("closes the gap when a block is excluded", () => {
    const r = resolveArrangement(
      stored({
        blocks: BLOCKS.map((b) => ({ id: b.id, on: b.id !== "trigger", sec: b.defaultSection })),
      })
    );
    const exec = r.sections.find((s) => s.id === "exec")!;
    expect(exec.blocks.map((b) => `${b.id}:${b.number}`)).toEqual([
      "purpose:1.1",
      "trigger:null",
      "roles:1.2",
      "ext:1.3",
    ]);
  });

  it("gives an excluded section's blocks no number at all", () => {
    const r = resolveArrangement(
      stored({ sections: [{ id: "exec", on: false }, { id: "map", on: true }] })
    );
    const exec = r.sections.find((s) => s.id === "exec")!;
    expect(exec.number).toBeNull();
    expect(exec.blocks.every((b) => b.number === null)).toBe(true);
  });

  it("gives a moved block its new section's prefix", () => {
    const r = resolveArrangement(
      stored({
        blocks: [
          ...BLOCKS.filter((b) => b.id !== "purpose").map((b) => ({
            id: b.id,
            on: true,
            sec: b.defaultSection,
          })),
          { id: "purpose", on: true, sec: "gov" },
        ],
      })
    );
    const gov = r.sections.find((s) => s.id === "gov")!;
    expect(gov.blocks.find((b) => b.id === "purpose")!.number).toBe("4.3");
  });

  it("never prints a number that skips, under any single exclusion", () => {
    for (const excluded of PROCESS_SECTIONS.map((s) => s.id)) {
      const r = resolveArrangement(
        stored({ sections: PROCESS_SECTIONS.map((s) => ({ id: s.id, on: s.id !== excluded })) })
      );
      const printed = r.sections.filter((s) => s.on).map((s) => s.number);
      expect(printed).toEqual(printed.map((_, i) => `${i + 1}.0`));
    }
  });
});

describe("isBlockEmpty", () => {
  it("reads a process with nothing recorded as empty everywhere", () => {
    for (const block of BLOCKS) {
      expect(isBlockEmpty(block.id, {}), `${block.id} should be empty`).toBe(true);
    }
  });

  it("reports an unknown block as empty rather than throwing", () => {
    // A renderer asking about a block the catalogue lacks is a bug, but not
    // one worth failing a client's document over.
    expect(() => isBlockEmpty("no-such-block", {})).not.toThrow();
    expect(isBlockEmpty("no-such-block", {})).toBe(true);
  });

  it("treats whitespace-only text as nothing recorded", () => {
    expect(isBlockEmpty("purpose", { processPurpose: "   " })).toBe(true);
    expect(isBlockEmpty("purpose", { processPurpose: "Buy things" })).toBe(false);
  });

  it("counts either half of Trigger & Output", () => {
    expect(isBlockEmpty("trigger", { triggerLabel: "Requisition" })).toBe(false);
    expect(isBlockEmpty("trigger", { outputLabel: "Paid invoice" })).toBe(false);
    expect(isBlockEmpty("trigger", { triggerLabel: "", outputLabel: null })).toBe(true);
  });

  it("separates a drawn map from a documented one", () => {
    // A process can have nine steps and no narrative; the diagram prints, the
    // narrative does not.
    const drawnOnly = { steps: [{ detailedAction: [], exceptionHandling: null }] };
    expect(isBlockEmpty("diagram", drawnOnly)).toBe(false);
    expect(isBlockEmpty("narr", drawnOnly)).toBe(true);

    const documented = { steps: [{ detailedAction: ["Check the PO"], exceptionHandling: null }] };
    expect(isBlockEmpty("narr", documented)).toBe(false);
  });

  it("needs both rows and roles before the RACI grid has anything to show", () => {
    expect(isBlockEmpty("raciGrid", { combinedRows: [{}], matrixRoles: [] })).toBe(true);
    expect(isBlockEmpty("raciGrid", { combinedRows: [], matrixRoles: [{}] })).toBe(true);
    expect(isBlockEmpty("raciGrid", { combinedRows: [{}], matrixRoles: [{}] })).toBe(false);
  });

  it("reads authority rules from the sentences, not the row count", () => {
    expect(isBlockEmpty("rules", { combinedRows: [{ ruleSentences: [] }] })).toBe(true);
    expect(isBlockEmpty("rules", { combinedRows: [{ ruleSentences: ["More than $10,000…"] }] })).toBe(
      false
    );
  });
});

describe("isSectionEmpty", () => {
  const sectionOf = (r: ReturnType<typeof resolveArrangement>, id: string) =>
    r.sections.find((s) => s.id === id)!;

  it("is empty when every included block is empty", () => {
    const r = resolveArrangement(stored());
    expect(isSectionEmpty(sectionOf(r, "exec"), {})).toBe(true);
  });

  it("is not empty when one included block has something", () => {
    const r = resolveArrangement(stored());
    expect(isSectionEmpty(sectionOf(r, "exec"), { processPurpose: "Buy things" })).toBe(false);
  });

  it("ignores excluded blocks — one that is not printed cannot fill a section", () => {
    const r = resolveArrangement(
      stored({
        blocks: BLOCKS.map((b) => ({ id: b.id, on: b.id !== "purpose", sec: b.defaultSection })),
      })
    );
    expect(isSectionEmpty(sectionOf(r, "exec"), { processPurpose: "Buy things" })).toBe(true);
  });

  it("is empty when every block has been moved out of it", () => {
    const r = resolveArrangement(
      stored({ blocks: BLOCKS.map((b) => ({ id: b.id, on: true, sec: "gov" })) })
    );
    expect(sectionOf(r, "exec").blocks).toHaveLength(0);
    expect(isSectionEmpty(sectionOf(r, "exec"), { processPurpose: "Buy things" })).toBe(true);
  });
});
