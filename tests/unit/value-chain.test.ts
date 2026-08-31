import { describe, it, expect } from "vitest";
import {
  boardTotals,
  groupByOwner,
  groupByPhase,
  ownerOptions,
  phaseColorFor,
  PHASE_COLORS,
  UNOWNED_COLUMN,
  UNPHASED_COLUMN,
  type ActivityCard,
  type PhaseRef,
} from "@/lib/domain/value-chain";

function card(overrides: Partial<ActivityCard> & { stepId: string; label: string }): ActivityCard {
  return {
    description: "",
    processId: "p1",
    processCode: "RHI100",
    ownerName: null,
    ownerId: null,
    supportNames: [],
    supportIds: [],
    phaseId: null,
    phaseOrder: 0,
    linksTo: [],
    isMilestone: false,
    ...overrides,
  };
}

const phases: PhaseRef[] = [
  { id: "init", name: "Initiation", order: 0, color: "#2563eb" },
  { id: "eval", name: "Evaluation", order: 1, color: "#7c3aed" },
  { id: "prop", name: "Proposal", order: 2, color: "#d97706" },
];

describe("groupByPhase", () => {
  it("columns the cards in phase order", () => {
    const columns = groupByPhase(
      [
        card({ stepId: "s1", label: "Offer Submission", phaseId: "prop" }),
        card({ stepId: "s2", label: "RFQ Receipt", phaseId: "init" }),
      ],
      phases
    );

    expect(columns.map((c) => c.title)).toEqual(["Initiation", "Evaluation", "Proposal"]);
    expect(columns[0]!.cards.map((c) => c.label)).toEqual(["RFQ Receipt"]);
    expect(columns[2]!.cards.map((c) => c.label)).toEqual(["Offer Submission"]);
  });

  it("keeps a phase with nothing in it — an empty stage is information", () => {
    const columns = groupByPhase([card({ stepId: "s1", label: "RFQ Receipt", phaseId: "init" })], phases);
    expect(columns).toHaveLength(3);
    expect(columns[1]!.cards).toEqual([]);
  });

  it("orders activities within a phase by the position someone put them in", () => {
    const columns = groupByPhase(
      [
        card({ stepId: "s1", label: "Third", phaseId: "init", phaseOrder: 2 }),
        card({ stepId: "s2", label: "First", phaseId: "init", phaseOrder: 0 }),
        card({ stepId: "s3", label: "Second", phaseId: "init", phaseOrder: 1 }),
      ],
      phases
    );

    expect(columns[0]!.cards.map((c) => c.label)).toEqual(["First", "Second", "Third"]);
  });

  it("falls back to the activity name when nothing has been arranged yet", () => {
    // Every step starts at position 0, so an untouched phase still needs a
    // stable order rather than whatever the database happened to return.
    const columns = groupByPhase(
      [
        card({ stepId: "s1", label: "Beta", phaseId: "init" }),
        card({ stepId: "s2", label: "Alpha", phaseId: "init" }),
      ],
      phases
    );
    expect(columns[0]!.cards.map((c) => c.label)).toEqual(["Alpha", "Beta"]);
  });

  it("orders the unphased column the same way", () => {
    const columns = groupByPhase(
      [
        card({ stepId: "s1", label: "Later", phaseOrder: 5 }),
        card({ stepId: "s2", label: "Earlier", phaseOrder: 1 }),
      ],
      phases
    );
    expect(columns.at(-1)!.cards.map((c) => c.label)).toEqual(["Earlier", "Later"]);
  });

  it("collects unphased work into a column of its own, only when there is some", () => {
    const withNone = groupByPhase([card({ stepId: "s1", label: "RFQ", phaseId: "init" })], phases);
    expect(withNone.map((c) => c.title)).not.toContain(UNPHASED_COLUMN);

    const withSome = groupByPhase(
      [card({ stepId: "s1", label: "RFQ", phaseId: "init" }), card({ stepId: "s2", label: "Loose end" })],
      phases
    );
    expect(withSome.at(-1)!.title).toBe(UNPHASED_COLUMN);
    expect(withSome.at(-1)!.cards.map((c) => c.label)).toEqual(["Loose end"]);
  });

  it("treats a card pointing at a phase that no longer exists as unphased", () => {
    const columns = groupByPhase([card({ stepId: "s1", label: "Orphan", phaseId: "deleted" })], phases);
    expect(columns.at(-1)!.title).toBe(UNPHASED_COLUMN);
  });

  it("orders by the phase's own order, not the order they were handed over", () => {
    const shuffled = [phases[2]!, phases[0]!, phases[1]!];
    expect(groupByPhase([], shuffled).map((c) => c.title)).toEqual(["Initiation", "Evaluation", "Proposal"]);
  });
});

describe("filtering", () => {
  const cards = [
    card({ stepId: "s1", label: "RFQ Receipt", phaseId: "init", ownerId: "comm", ownerName: "Commercial", supportNames: ["CEO"] }),
    card({
      stepId: "s2",
      label: "Technical Evaluation",
      description: "Evaluate the needs and technical requirements.",
      phaseId: "eval",
      ownerId: "tech",
      ownerName: "Technical Office",
    }),
  ];

  it("searches the label", () => {
    const columns = groupByPhase(cards, phases, { search: "RFQ" });
    expect(columns.flatMap((c) => c.cards).map((c) => c.label)).toEqual(["RFQ Receipt"]);
  });

  it("searches the description too, case-insensitively", () => {
    const columns = groupByPhase(cards, phases, { search: "TECHNICAL REQUIREMENTS" });
    expect(columns.flatMap((c) => c.cards).map((c) => c.label)).toEqual(["Technical Evaluation"]);
  });

  it("searches the owner and the supporting departments", () => {
    expect(groupByPhase(cards, phases, { search: "Technical Office" }).flatMap((c) => c.cards)).toHaveLength(1);
    expect(groupByPhase(cards, phases, { search: "CEO" }).flatMap((c) => c.cards)[0]!.label).toBe("RFQ Receipt");
  });

  it("filters to one owner", () => {
    const columns = groupByPhase(cards, phases, { ownerId: "tech" });
    expect(columns.flatMap((c) => c.cards).map((c) => c.label)).toEqual(["Technical Evaluation"]);
  });

  it("ignores blank search text", () => {
    expect(groupByPhase(cards, phases, { search: "   " }).flatMap((c) => c.cards)).toHaveLength(2);
  });
});

describe("groupByOwner", () => {
  it("columns by department, busiest first", () => {
    const columns = groupByOwner([
      card({ stepId: "s1", label: "A", ownerId: "comm", ownerName: "Commercial" }),
      card({ stepId: "s2", label: "B", ownerId: "fin", ownerName: "Finance" }),
      card({ stepId: "s3", label: "C", ownerId: "comm", ownerName: "Commercial" }),
    ]);

    expect(columns.map((c) => c.title)).toEqual(["Commercial", "Finance"]);
    expect(columns[0]!.cards).toHaveLength(2);
  });

  it("puts work with no owner last, however much of it there is", () => {
    const columns = groupByOwner([
      card({ stepId: "s1", label: "A", ownerId: "comm", ownerName: "Commercial" }),
      card({ stepId: "s2", label: "B" }),
      card({ stepId: "s3", label: "C" }),
      card({ stepId: "s4", label: "D" }),
    ]);

    expect(columns.at(-1)!.title).toBe(UNOWNED_COLUMN);
    expect(columns.at(-1)!.cards).toHaveLength(3);
  });

  it("breaks a tie on department name so the board is stable", () => {
    const columns = groupByOwner([
      card({ stepId: "s1", label: "A", ownerId: "z", ownerName: "Zeta" }),
      card({ stepId: "s2", label: "B", ownerId: "a", ownerName: "Alpha" }),
    ]);
    expect(columns.map((c) => c.title)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("boardTotals", () => {
  it("counts activities, phases, and every department involved either way", () => {
    const totals = boardTotals(
      [
        card({ stepId: "s1", label: "A", ownerId: "comm", ownerName: "Commercial", supportNames: ["CEO"] }),
        card({ stepId: "s2", label: "B", ownerId: "fin", ownerName: "Finance", supportNames: ["Commercial"] }),
      ],
      phases
    );

    // Commercial, CEO, Finance — Commercial counted once though it appears as
    // both an owner and support.
    expect(totals).toEqual({ activities: 2, phases: 3, departments: 3 });
  });

  it("counts nothing for an empty board", () => {
    expect(boardTotals([], [])).toEqual({ activities: 0, phases: 0, departments: 0 });
  });
});

describe("ownerOptions", () => {
  it("lists each department once, by name", () => {
    expect(
      ownerOptions([
        card({ stepId: "s1", label: "A", ownerId: "z", ownerName: "Zeta" }),
        card({ stepId: "s2", label: "B", ownerId: "a", ownerName: "Alpha" }),
        card({ stepId: "s3", label: "C", ownerId: "a", ownerName: "Alpha" }),
        card({ stepId: "s4", label: "D" }),
      ])
    ).toEqual([
      { id: "a", name: "Alpha" },
      { id: "z", name: "Zeta" },
    ]);
  });
});

describe("phaseColorFor", () => {
  it("hands out the palette in order", () => {
    expect(phaseColorFor(0)).toBe(PHASE_COLORS[0]);
    expect(phaseColorFor(2)).toBe(PHASE_COLORS[2]);
  });

  it("cycles rather than running out", () => {
    expect(phaseColorFor(PHASE_COLORS.length)).toBe(PHASE_COLORS[0]);
  });
});
