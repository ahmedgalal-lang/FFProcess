import { describe, it, expect } from "vitest";
import { normalizeFindingTitle, partitionNewFindings, appendReviewNote } from "@/lib/domain/review-findings";

describe("normalizeFindingTitle", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normalizeFindingTitle("  No  Tolerance   Rule  ")).toBe("no tolerance rule");
  });
});

describe("partitionNewFindings", () => {
  it("keeps a finding with no matching dismissed or tracked title", () => {
    const raw = [{ title: "No tolerance rule" }];
    const result = partitionNewFindings(raw, new Set(), new Set());
    expect(result).toEqual(raw);
  });

  it("drops a finding matching a dismissed title, case/whitespace-insensitively", () => {
    const raw = [{ title: "  NO Tolerance  Rule " }];
    const result = partitionNewFindings(raw, new Set(["no tolerance rule"]), new Set());
    expect(result).toEqual([]);
  });

  it("drops a finding matching an already-tracked title", () => {
    const raw = [{ title: "PO approver can also release payment" }];
    const result = partitionNewFindings(raw, new Set(), new Set(["po approver can also release payment"]));
    expect(result).toEqual([]);
  });

  it("keeps some and drops others in a mixed batch", () => {
    const raw = [{ title: "Issue A" }, { title: "Issue B" }, { title: "Issue C" }];
    const result = partitionNewFindings(raw, new Set(["issue b"]), new Set(["issue c"]));
    expect(result.map((f) => f.title)).toEqual(["Issue A"]);
  });
});

describe("appendReviewNote", () => {
  it("returns the trimmed note when there are no existing notes", () => {
    expect(appendReviewNote(null, "  Add a tolerance threshold.  ")).toBe("Add a tolerance threshold.");
    expect(appendReviewNote("", "Add a tolerance threshold.")).toBe("Add a tolerance threshold.");
    expect(appendReviewNote("   ", "Add a tolerance threshold.")).toBe("Add a tolerance threshold.");
  });

  it("joins existing and new notes with a blank line", () => {
    expect(appendReviewNote("First note.", "Second note.")).toBe("First note.\n\nSecond note.");
  });

  it("trims both sides before joining", () => {
    expect(appendReviewNote("  First note.  ", "  Second note.  ")).toBe("First note.\n\nSecond note.");
  });
});
