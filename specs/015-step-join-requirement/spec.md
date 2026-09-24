# Feature Specification: Step Join Requirement

**Feature Branch**: `015-step-join-requirement`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "Let a step require more than one predecessor to be reached — a real join, not just a merge. Reported by the consultant: 'sometimes in a process, 2 separate steps deliver an outcome that are needed (both) to start another step' — and today the app has no way to express that. Any step can already have multiple incoming connections, but nothing distinguishes 'starts once EITHER of these is done' (today's only behavior) from 'starts only once BOTH/ALL of these are done' (a true join). The printed map already draws a merge and names it ('joins step 7 and step 8') but that carries no meaning about which kind of convergence it is."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seeing and managing all of a step's predecessors, not just one (Priority: P1)

A consultant is building or editing a process and reaches a step that two earlier steps both feed into — today the Steps List shows only one of those two connections, with no way to see or add the second from that step's own row. They need to see every predecessor a step has, and add or remove one, from that one step's own editor.

**Why this priority**: Without this, there is nothing to mark as "both required" in the first place — a consultant cannot express the join being asked for if the tool only ever shows them one incoming connection at a time. This is the same kind of gap the Decision branch editor closed on the outgoing side.

**Independent Test**: On a step that already has two incoming connections (created some other way), open its editor and confirm both are listed, each individually editable and removable — where before only one would have shown.

**Acceptance Scenarios**:

1. **Given** a step with two connections already leading into it, **When** the consultant opens that step's editor, **Then** both connections are listed, not just one.
2. **Given** a step's editor open with one predecessor shown, **When** the consultant adds another predecessor, **Then** a second connection is created from the chosen earlier step, and both are now listed.
3. **Given** a step with two predecessors listed in its editor, **When** the consultant removes one, **Then** only that connection is deleted — the step itself and its other predecessor are unaffected.

---

### User Story 2 - Marking a step as needing every predecessor done, not just one (Priority: P1)

Once a step shows more than one predecessor, the consultant can say whether the step is reachable as soon as any one of them finishes (today's only behavior, and still the default) or only once every one of them has finished — the actual "both are needed" case reported.

**Why this priority**: This is the reported gap itself. Everything else in this feature exists to make this one choice expressible and visible.

**Independent Test**: Give a step two predecessors, leave the rule at its default, and confirm the map still reads as an ordinary convergence (either predecessor is enough). Switch the rule to "requires all," and confirm the step now reads as waiting on both.

**Acceptance Scenarios**:

1. **Given** a step with two predecessors and no rule set, **When** the consultant views it anywhere in the product, **Then** it reads exactly as an ordinary convergence does today — nothing about its appearance changes because of this feature alone.
2. **Given** a step with two predecessors, **When** the consultant sets its rule to "requires all," **Then** the step is recorded as needing every one of its predecessors, not just one.
3. **Given** a step already set to "requires all," **When** the consultant sets it back to "either is enough," **Then** the step reverts to reading as an ordinary convergence.

---

### User Story 3 - Reading which kind of convergence it is, wherever the process is shown (Priority: P2)

A reader of the Steps List, the live process map, or the printed report can tell, without asking anyone, whether a step's convergence point means "either path gets you here" or "both paths are required."

**Why this priority**: The rule from User Story 2 is only useful once it is visible to someone other than the person who set it — a client reading the printed report, or another consultant picking up the engagement. This depends on User Story 2 existing to have anything to show.

**Independent Test**: Set one step's rule to "requires all" and leave another's at the default, in the same process. Confirm the printed report and the live map describe the two differently, and that only the "requires all" step's own wording changed.

**Acceptance Scenarios**:

1. **Given** a step set to "requires all" with two predecessors named "Legal sign-off" and "Client sign-off," **When** the printed report is generated, **Then** it reads as the step needing both, by name — not the existing, unqualified "joins step X and step Y" wording.
2. **Given** a step left at the default with two predecessors, **When** the printed report is generated, **Then** it reads exactly as an ordinary convergence does today, unchanged by this feature.
3. **Given** the same "requires all" step, **When** viewed on the live process map, **Then** the same distinction is visible there too.

---

### Edge Cases

- What happens when a step's rule is set to "requires all" but it only has one predecessor (the second was removed after the rule was set)? The rule stays set, but has nothing to act on with only one predecessor — it reads as an ordinary single connection until a second predecessor is added again, at which point the standing rule applies to both.
- What happens when a step has three or more predecessors and its rule is "requires all"? All of them are required, not just two — the rule is not limited to pairs.
- What happens to a step's rule when it is edited some other way (renamed, retyped, moved)? The rule is untouched — it is a property of the step's own arrival condition, independent of its label, type, or position.
- What happens to existing processes, and their already-converging steps, when this feature ships? Nothing changes in how they read or print — every step's rule defaults to "either is enough," which is exactly what an unmarked convergence has always meant.
- What happens when a consultant tries to set "requires all" on a step that has no predecessors, or only one? The rule can still be set, in anticipation of a second predecessor being added later (per the first edge case above); it simply has no visible effect until there are two or more.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A step's editor MUST show every connection currently leading into that step, not only one.
- **FR-002**: The consultant MUST be able to add a new predecessor to a step, choosing any other step in the process, including one that comes later (a loop-back), the same latitude the Decision branch editor already gives the outgoing side.
- **FR-003**: The consultant MUST be able to remove one of a step's predecessors without affecting its other predecessors or the step itself.
- **FR-004**: Every step MUST carry a rule for how its predecessors combine: "either is enough" (the default) or "requires all." A newly created step, and every step that exists before this feature ships, MUST default to "either is enough."
- **FR-005**: The consultant MUST be able to change a step's rule between "either is enough" and "requires all" at any time, independent of how many predecessors it currently has.
- **FR-006**: A step's arrival rule MUST NOT alter how the map is drawn — no new shape, no new connector style — only how a convergence is described in words, on every surface that already describes one (the printed report's Flow and Roles layouts, and the live process map).
- **FR-007**: A step set to "either is enough" MUST read identically, on every surface, to how an unmarked convergence reads today — this feature MUST NOT change the appearance of any process that does not use "requires all."
- **FR-008**: A step set to "requires all" MUST be described, on every surface that already names a convergence, by naming every predecessor it requires — not merely flagged as different with no explanation.
- **FR-009**: Managing a step's predecessors or its arrival rule MUST require the same workspace access level every other step-editing control in the product already requires; a viewer-level user MUST NOT be offered these controls.

### Key Entities

- **Process Step**: An existing entity. Gains one new fact about itself: its arrival rule ("either is enough" / "requires all"). No new entity is needed to hold it.
- **Step Connection**: An existing entity, unchanged. A step's predecessors are simply its own incoming connections — exactly as a Decision step's branches (spec 014) are simply its own outgoing connections. Adding a predecessor creates one; removing one deletes it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can see and manage every predecessor of a step with two or more incoming connections, from that step's own editor, in under 30 seconds — without leaving the Steps List.
- **SC-002**: Zero processes that exist before this feature ships change in appearance, on the printed report or the live map, the first time they are opened after it does.
- **SC-003**: A reader of the printed report, given no other explanation, can tell apart a step that needs only one of its predecessors from one that needs all of them, by name, for every such step in the process.
- **SC-004**: A consultant can turn a step's rule on and reverse it back off, and the step reads exactly as it did before, with nothing left over from having tried it.

## Assumptions

- **The two-step case from the report ("2 separate steps... needed (both)") is the common case, not a hard limit.** A step's rule applies uniformly to however many predecessors it has — three or more "requires all" is not a special case needing its own handling.
- **This is a documentation fact, not an execution rule.** FFProcess maps, does not run, a process; "requires all" is asserted the same way a Decision's Yes/No branches are asserted (spec 014) — nothing here checks whether a predecessor is actually "done" in any live sense.
- **Out of scope**: the 7a/7b parallel step numbering a fork/join pair could eventually justify in the Steps List. A deliberate, separate follow-on feature once joins exist, not part of this one.
- **Out of scope**: a dedicated mechanism for the *outgoing* side — a step whose multiple outgoing connections all run concurrently (a "fork," as opposed to a Decision's exclusive either/or). A step can already have multiple outgoing connections today; this feature does not change what that means. It is the mirror-image feature, and a separate one.
- **Out of scope**: any change to what a Decision step's own branches (spec 014) mean or how they are edited. A join is about what a step requires to be *reached*; a Decision's branches are about what happens *after* one specific step. The two are independent and a step can be affected by both at once (e.g., a Decision step that itself has two predecessors) without conflict.
