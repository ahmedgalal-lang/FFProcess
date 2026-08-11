import { describe, expect, it } from "vitest";
import { canChangeLastAdmin, canChangeLastFirmOwner, hasSufficientAccess } from "@/lib/domain/access-control";

describe("hasSufficientAccess", () => {
  it("VIEWER does not satisfy an EDITOR requirement", () => {
    expect(hasSufficientAccess("VIEWER", "EDITOR")).toBe(false);
  });
  it("ADMIN satisfies any requirement", () => {
    expect(hasSufficientAccess("ADMIN", "VIEWER")).toBe(true);
    expect(hasSufficientAccess("ADMIN", "EDITOR")).toBe(true);
    expect(hasSufficientAccess("ADMIN", "ADMIN")).toBe(true);
  });
});

describe("canChangeLastAdmin (FR-016)", () => {
  it("blocks removing/downgrading the sole remaining Admin", () => {
    expect(canChangeLastAdmin(1)).toBe(false);
  });
  it("allows the change when another Admin remains", () => {
    expect(canChangeLastAdmin(2)).toBe(true);
  });
});

describe("canChangeLastFirmOwner (FR-026)", () => {
  it("blocks removing/downgrading the sole remaining Firm Owner", () => {
    expect(canChangeLastFirmOwner(1)).toBe(false);
  });
  it("allows the change when another Owner remains", () => {
    expect(canChangeLastFirmOwner(2)).toBe(true);
  });
});
