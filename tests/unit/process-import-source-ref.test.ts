import { describe, it, expect } from "vitest";
import {
  toProvisionalId,
  fromProvisionalId,
  describeSource,
  REQUIRED_SHEETS,
  SHEETS,
  FORMAT_VERSION,
} from "@/lib/domain/process-import";

/**
 * The provisional id is the mechanism that lets the product's own validators —
 * which all key on database ids — run against a file before anything has been
 * written. If it does not round-trip, every problem the importer reports points
 * at the wrong row, which is worse than reporting none.
 */
describe("provisional ids", () => {
  it("round-trips a sheet and a row", () => {
    const source = { sheet: "Steps", row: 7 };
    expect(toProvisionalId(source)).toBe("Steps!7");
    expect(fromProvisionalId("Steps!7")).toEqual(source);
  });

  it("round-trips every sheet this template actually has", () => {
    for (const sheet of REQUIRED_SHEETS) {
      for (const row of [1, 2, 42, 301]) {
        expect(fromProvisionalId(toProvisionalId({ sheet, row }))).toEqual({ sheet, row });
      }
    }
  });

  it("round-trips a sheet name containing the separator", () => {
    // Splitting on the first "!" would read the row as "Ops" and lose it.
    const source = { sheet: "Odd!Sheet", row: 12 };
    expect(fromProvisionalId(toProvisionalId(source))).toEqual(source);
  });

  it("writes a location the way a consultant reads one", () => {
    expect(describeSource({ sheet: "RACI", row: 12 })).toBe("RACI, row 12");
  });
});

describe("the sheet declaration", () => {
  it("names every sheet the importer requires", () => {
    expect(REQUIRED_SHEETS).toContain("Read Me");
    expect(REQUIRED_SHEETS).toContain(SHEETS.steps.name);
    expect(REQUIRED_SHEETS).toContain(SHEETS.authority.name);
    expect(new Set(REQUIRED_SHEETS).size).toBe(REQUIRED_SHEETS.length);
  });

  it("never invites a process code, which the system generates", () => {
    const everyLabel = [
      ...SHEETS.process.fields.map((f) => f.label),
      ...SHEETS.steps.columns.map((c) => c.label),
    ].join(" ").toLowerCase();
    expect(everyLabel).not.toContain("code");
  });

  it("says what every column accepts, so the template can state it", () => {
    for (const sheet of Object.values(SHEETS)) {
      const entries = "columns" in sheet ? sheet.columns : sheet.fields;
      for (const entry of entries) {
        expect(entry.accepts.length, `${sheet.name} · ${entry.label}`).toBeGreaterThan(0);
      }
    }
  });

  it("carries a format version, so an older workbook can be refused by name", () => {
    expect(FORMAT_VERSION).toMatch(/^process-import v\d+$/);
  });
});
