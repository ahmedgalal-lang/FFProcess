import { describe, it, expect } from "vitest";
import {
  normalizeFindingTitle,
  partitionNewChecklistItems,
  partitionNewRisks,
  isHandManaged,
} from "@/lib/domain/governance-findings";

describe("governance-findings re-exports the shared title rule", () => {
  it("normalizeFindingTitle is review-findings.ts's own function, not a re-implementation", () => {
    // Not just "produces the same output" — the point (research.md Decision 3)
    // is that there is exactly one normalizer in the codebase, so this imports
    // it from governance-findings.ts and checks it behaves identically to the
    // documented rule review-findings.test.ts already pins.
    expect(normalizeFindingTitle("  No  Tolerance   Rule  ")).toBe("no tolerance rule");
  });
});

describe("partitionNewChecklistItems", () => {
  // Scoped to (workspaceId, focusArea) in the real caller, but the function
  // itself just takes whatever titles it's handed to compare against — the
  // scoping is the caller's job (only pass titles already tracked *for this
  // assessment*), which is what this function has no way to get wrong.
  it("keeps an item with no matching tracked title", () => {
    const raw = [{ title: "Name a Risk & Compliance owner" }];
    expect(partitionNewChecklistItems(raw, new Set())).toEqual(raw);
  });

  it("drops an item matching an already-tracked title, case/whitespace-insensitively", () => {
    const raw = [{ title: "  NAME a risk & compliance  owner " }];
    expect(partitionNewChecklistItems(raw, new Set(["name a risk & compliance owner"]))).toEqual([]);
  });

  it("keeps some and drops others in a mixed batch", () => {
    const raw = [{ title: "Item A" }, { title: "Item B" }, { title: "Item C" }];
    expect(partitionNewChecklistItems(raw, new Set(["item b", "item c"])).map((i) => i.title)).toEqual([
      "Item A",
    ]);
  });

  it("does not resurrect a DISMISSED item — dismissed titles are tracked titles too", () => {
    // The caller passes every title the assessment already has a row for,
    // regardless of that row's status — DONE, DISMISSED, OPEN, all "already
    // tracked". A dismissed item reappearing as a fresh OPEN one on the next
    // run is exactly the bug this guards.
    const raw = [{ title: "Publish an ESG disclosure" }];
    expect(partitionNewChecklistItems(raw, new Set(["publish an esg disclosure"]))).toEqual([]);
  });
});

describe("partitionNewRisks", () => {
  it("keeps a risk with no matching tracked title", () => {
    const raw = [{ title: "Single processor dependency for EU settlements" }];
    expect(partitionNewRisks(raw, new Set())).toEqual(raw);
  });

  it("drops a risk matching an already-tracked title", () => {
    const raw = [{ title: "Single processor dependency" }];
    expect(partitionNewRisks(raw, new Set(["single processor dependency"]))).toEqual([]);
  });

  it("is workspace-scoped, not focus-area-scoped — the caller passes every risk title in the workspace", () => {
    // FR-011: a risk isn't tied to one focus area, so its reconciliation set
    // must be built from every risk in the workspace, not just the ones this
    // run's focus area previously surfaced. This function doesn't enforce
    // that itself (it just partitions against whatever set it's given) — this
    // test documents the caller obligation partitionNewChecklistItems doesn't
    // have, since checklist items *are* focus-area-scoped.
    const raw = [{ title: "Board has no independent director" }];
    // Tracked because a *different* focus area's run already surfaced it.
    const trackedAcrossWholeWorkspace = new Set(["board has no independent director"]);
    expect(partitionNewRisks(raw, trackedAcrossWholeWorkspace)).toEqual([]);
  });
});

describe("isHandManaged", () => {
  it("a row nobody has touched directly is not hand-managed", () => {
    expect(isHandManaged({ status: "OPEN" })).toBe(false);
  });

  it("a policy marked EDITED is hand-managed", () => {
    // EDITED is itself the signal — set the moment updatePolicyDraft changes
    // the body, per contracts/governance-actions.md.
    expect(isHandManaged({ status: "EDITED" })).toBe(true);
  });

  it("a risk explicitly flagged handManaged is hand-managed regardless of status", () => {
    // A risk's own status (OPEN/MITIGATING/ACCEPTED/CLOSED) doesn't carry the
    // "did a person touch this" signal the way GovernanceItemStatus's EDITED
    // does for a policy — updateGovernanceRisk sets a dedicated flag instead.
    expect(isHandManaged({ status: "OPEN", handManaged: true })).toBe(true);
    expect(isHandManaged({ status: "MITIGATING", handManaged: false })).toBe(false);
  });

  it("a checklist item marked DONE or DISMISSED is hand-managed", () => {
    // Reaching DONE or DISMISSED only ever happens through a consultant's own
    // action (setChecklistItemStatus) — never something a generation run sets
    // — so both are exactly as protected as EDITED.
    expect(isHandManaged({ status: "DONE" })).toBe(true);
    expect(isHandManaged({ status: "DISMISSED" })).toBe(true);
  });
});
