# Feature Specification: Parallel Step Numbering

**Feature Branch**: `016-parallel-step-numbering`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "Number two or more Steps List entries with a shared base number and letter suffixes (4a, 4b) instead of separate whole numbers, when they run in parallel rather than in sequence — and continue the numbering afterward as if that lettered group only used one slot (1, 2, 3, 4a, 4b, 5, 6...), so the sequence still reads naturally. Deliberate follow-on to spec 015 (the step join requirement): two steps that both feed into the same 'requires all' step still get consecutive whole numbers (4, 5) today even though nothing about them is sequential — neither comes before the other, they just both have to finish before the next step can start. 'Parallel siblings' = two or more steps that are both direct predecessors of the same joinRequiresAll step, with no path between them in either direction. Numbering-only — no new 'fork' mechanism, no schema change to detect a group, no change to the live canvas (which draws connections, not numbers) or to wording that already names steps by label (spec 015's 'needs both X and Y'). Zero numbering change for any process that doesn't use joinRequiresAll. A step's stored order/position is unaffected — only the displayed label changes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reading which steps are parallel, right from their numbers (Priority: P1)

A consultant or a client reading the Steps List, or the printed report, reaches two steps that both lead into a step marked "requires all" (spec 015). Today those two steps are numbered consecutively — 4, 5 — which reads as "do 4, then do 5," even though nothing requires that order: both simply have to finish before the next step can start. The reader has no way to tell, from the numbers alone, that these two are companions rather than a sequence.

**Why this priority**: This is the entire feature. Everything else exists to make this one distinction visible without the reader having to trace the diagram themselves.

**Independent Test**: Build a process where two steps both feed into a step whose rule is "requires all," with no connection between the two feeding steps themselves. Confirm they print as "4a" and "4b" (or whatever position they start at) rather than as two separate whole numbers, and that a plain reader — given no other explanation — can tell they're companions, not a sequence.

**Acceptance Scenarios**:

1. **Given** two steps at positions 4 and 5, both feeding a step marked "requires all," and no connection between the two of them, **When** the Steps List is viewed, **Then** they read as "4a" and "4b," not "4" and "5."
2. **Given** the same process, **When** the printed report is generated (either layout), **Then** the same two steps read as "4a" and "4b" there too — on their own cards, and in any reference to "step 4a"/"step 4b" elsewhere on the report.
3. **Given** the lettered pair "4a"/"4b," **When** the reader looks at the step immediately after them, **Then** it reads as "5" — the sequence continues exactly as if the pair had used one slot, not two.

---

### User Story 2 - A genuine sequence is never mislabeled as parallel (Priority: P1)

Two steps both happen to feed into a "requires all" step, but one of them is actually a predecessor of the other — a real chain, not a parallel pair (e.g., Step A leads to Step B, and Step B *also* separately feeds the "requires all" step directly). The consultant needs this correctly read as ordinary sequential numbering, not mislabeled as parallel just because both eventually reach the same join.

**Why this priority**: A wrong "parallel" label is worse than no label at all — it tells the reader two things are companions when one genuinely depends on the other finishing first. This has to hold before the feature can be trusted.

**Independent Test**: Build a process where Step 4 leads to Step 5, and Step 5 is one of two direct predecessors of a "requires all" step (the other predecessor being an unrelated Step 3 elsewhere). Confirm Step 4 and Step 5 print as ordinary "4" and "5" — never lettered — because a path exists between them.

**Acceptance Scenarios**:

1. **Given** two steps that both eventually reach the same "requires all" step, but one is reachable from the other through some chain of connections, **When** either is viewed anywhere in the product, **Then** both keep ordinary whole numbers — lettering never applies to them.
2. **Given** three or more steps that are all direct predecessors of the same "requires all" step, with no path between any pair of them, **When** viewed anywhere, **Then** all of them share the same base number with distinct letters (4a, 4b, 4c) — lettering is not limited to pairs.

---

### User Story 3 - Every process that hasn't used the join requirement looks exactly as it always has (Priority: P1)

A consultant working on any process that has never used "requires all" continues to see plain, whole-number steps everywhere, unchanged, the moment this feature ships.

**Why this priority**: This is the same non-negotiable bar spec 015 held itself to — a display feature that changes the appearance of work nobody touched would be a regression dressed up as an improvement.

**Independent Test**: Open a handful of existing processes that use ordinary either/or convergence (or no convergence at all). Confirm every step number and every printed reference to a step number is identical to what it was before this feature shipped.

**Acceptance Scenarios**:

1. **Given** a process with no step marked "requires all," **When** the Steps List or the printed report is viewed, **Then** every step number is a plain whole number, exactly as before.
2. **Given** a process with a step marked "requires all" but only one predecessor (the second was never added, or was removed — spec 015's own edge case), **When** viewed anywhere, **Then** that one predecessor keeps its ordinary whole number — lettering needs an actual pair or group, not just the rule being turned on.

---

### Edge Cases

- What happens when a "requires all" step has three or more direct predecessors, and some pairs among them have a path between them while others don't? Only the predecessors with no path to any other predecessor in the same set are grouped together and lettered as one group; a predecessor that has a path to another one is excluded from the lettered group and keeps its own ordinary number, next to (not inside) the group.
- What happens when a process has two *separate* "requires all" steps, each with its own pair of parallel predecessors, earlier and later in the same process? Each pair is lettered independently against its own starting position — the first pair might be "4a"/"4b," a later, unrelated pair further down the list is lettered from whatever position it starts at, continuing the same running sequence.
- What happens to the base number a lettered group uses — is it the position of the earliest sibling, or something else? The group's shared number is the position the group's first member would have had if numbered normally, in Steps List order — the group's own two (or more) entries simply become "Na," "Nb," … in that same order, and nothing after them shifts by more than the group's own size minus one.
- What happens when a "requires all" step's own predecessors are lettered, but that step is itself also a lettered sibling of some *other* "requires all" step further down the process? Each step's own numbering is computed independently from its own role as a predecessor elsewhere — being lettered as a predecessor of one join does not stop a step from separately being the entry point into another.
- What happens when the rule on the shared successor is turned back off ("either is enough")? Its former predecessors immediately return to plain, consecutive whole numbers — lettering exists only while the rule that justifies it is on, the same reversibility spec 015 itself guaranteed for the rule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST identify, for any step whose arrival rule is "requires all" (spec 015) and that has two or more direct predecessors, which of those predecessors have no path to one another through any chain of connections — this set is a "parallel group."
- **FR-002**: A predecessor that does have a path to another predecessor in the same set MUST be excluded from that parallel group and MUST keep an ordinary whole-number position.
- **FR-003**: Every member of a parallel group MUST be displayed with the same base number and a distinct letter suffix, assigned in the Steps List's own order (the earliest-positioned member gets "a," the next "b," and so on) — never as separate whole numbers.
- **FR-004**: The base number a parallel group displays MUST be the whole-number position its first (earliest) member would have held under ordinary sequential numbering.
- **FR-005**: Every step positioned after a parallel group MUST be renumbered so the sequence continues exactly as if the group had occupied one position rather than several — no gap, and no number skipped or repeated.
- **FR-006**: This numbering MUST be shown everywhere a step's number is currently shown: the Steps List's own row numbers, the printed report's Flow layout (card numbers and any "step N" reference, including back-references), and the printed report's Roles layout (cell numbers).
- **FR-007**: This feature MUST NOT change any wording that already refers to a step by its label rather than its number (for example, spec 015's "needs both X and Y" phrasing) — only bare numeric references are affected.
- **FR-008**: This feature MUST NOT change the live process map canvas in any way — it draws connections, not step numbers, and has nothing for this feature to alter.
- **FR-009**: A process with no step whose rule is "requires all," or one where every "requires all" step has fewer than two qualifying predecessors, MUST display identically, in every location covered by FR-006, to how it displayed before this feature existed.
- **FR-010**: A step's own stored position (used for reordering, move up/down, and "arrange by flow") MUST be unaffected by this feature — only the number or letter-suffixed label shown to a reader changes, never the underlying order steps are stored or reasoned about in.
- **FR-011**: Turning a step's "requires all" rule off MUST immediately return its former parallel-group predecessors to ordinary, consecutive whole-number display, with the same renumbering guarantee as FR-005 applied in reverse.

### Key Entities

- **Process Step**: An existing entity, unchanged — no new fact is stored on it. Its display number becomes a computed label rather than always being its raw position, but nothing new is persisted.
- **Step Connection**: An existing entity, unchanged — used only to compute reachability between a "requires all" step's predecessors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader with no other explanation can tell, from the numbering alone, which steps in a process run in parallel rather than in sequence, for every "requires all" step that has a genuine parallel group.
- **SC-002**: Zero processes that exist before this feature ships, and don't use "requires all" with two or more qualifying predecessors, change in appearance the first time they're opened or printed after it does.
- **SC-003**: A consultant can turn a step's "requires all" rule on, see its predecessors letter, turn it back off, and see the exact numbering the process had before — nothing left over from having tried it.
- **SC-004**: Every step number in a process — lettered or plain — remains unique and appears exactly once, on the Steps List and on both printed layouts, for any process shape covered by the Edge Cases above.

## Assumptions

- **Builds directly on spec 015 and nothing else.** The only new input this feature reads is the same `joinRequiresAll` fact and the same `StepConnection` graph spec 015 already established; no new field, no new entity.
- **"No path between them" means no path through the process's connections in either direction**, exactly as spec 015's own reachability language implies for a join being meaningful — not a narrower notion (e.g., "not adjacent in the list") and not a broader one (e.g., "not assigned to the same role").
- **Out of scope**: a dedicated "fork" mechanism for the *outgoing* side (a step whose multiple outgoing connections are explicitly marked as starting together). This feature infers a parallel group structurally, from a join's own predecessors — it does not require, and does not add, any new marker on the outgoing side. A fork mechanism remains a separate, independent feature, exactly as spec 015 left it.
- **Out of scope**: any change to how a "requires all" step's own wording reads (spec 015's "needs both X and Y") — that already names steps by label, not number, and is untouched here.
- **Numbering is a display fact, not a stored one.** Like spec 015's join rule itself, this is asserted for a reader's benefit; FFProcess still does not execute or schedule a process, so nothing here checks whether steps are actually being done in parallel in any live sense.
