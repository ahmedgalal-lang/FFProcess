# Feature Specification: Authority Rule Builder

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Rebuild the Authority Matrix row as a rule builder, and let a task carry more than one rule." Design signed off from an interactive demo the user reviewed.

## Why

A consultant writing an Authority Matrix today fills in a row with five always-present
columns — SLA, Amount, Direction, Approval, Co-approval, Escalation — whether or not each
one applies to the task in front of them. Most rows use two or three of the five, so most
of every row is empty columns the reader has to skim past.

Worse, one row is being asked to hold two unrelated governance rules at once. This is a
single row today:

> More than $10,000 needs approval from AP Clerk, within 2 days. If 2 days pass with no
> decision, it escalates to Procurement Lead.

That is a money rule (a spending limit that demands a signature) and a time rule (a
turnaround that, when missed, hands the task to someone else) welded together because the
table has one row per task. They can be edited only together, and a task that needs two
signatures has nowhere to put the second one except the special-purpose "co-approval"
column.

The fix is to stop treating a row as a task and start treating it as **one rule**, and to
let a task carry as many rules as it actually has.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a rule in three moves (Priority: P1)

A consultant opens the Authority Matrix for a process and adds a spending rule to a task.
They choose what the rule turns on — money or time — and only the input that applies
appears. They set the figure, choose which side of it the rule fires on, and choose what
happens then: the task needs approval from someone, or it escalates to someone. As they
work, a plain-language sentence under the row says exactly what they have built.

**Why this priority**: This is the whole feature. Without it there is no rule builder, and
every other story is an extension of it. It is also independently valuable: even with one
rule per task, a consultant stops reading past four empty columns on every row.

**Independent Test**: Open the Authority Matrix, add a money rule to a task, and confirm
the row shows a currency input (not a days input), the rule sentence reads correctly, and
the rule survives a page reload.

**Acceptance Scenarios**:

1. **Given** a task with no rules, **When** the consultant adds a rule and chooses Money,
   **Then** a currency input appears, no turnaround input is shown, and the "Then" choice
   offers approval or escalation.
2. **Given** a rule set to Money, **When** the consultant switches it to Time, **Then** the
   currency input is replaced by a turnaround input and the rule sentence rewrites itself
   to describe days rather than an amount.
3. **Given** a rule with an amount, a direction and an approver, **When** the consultant
   reads the sentence under the row, **Then** it states the direction, the figure and the
   named approver in plain language.
4. **Given** a rule whose direction is "Equal — no rule at all", **When** the row renders,
   **Then** it is visibly dimmed and its figure and "Then" choice are not required.
5. **Given** a consultant has built a rule, **When** the page is reloaded, **Then** the
   rule is still there with every choice intact.

---

### User Story 2 - Give one task several rules (Priority: P1)

A task needs two signatures above different amounts, or it needs both a spending limit and
a turnaround. The consultant presses a button to add another rule to the same task and
builds it the same way. The task's rules read top to bottom as a list of independent
statements.

**Why this priority**: Also P1, because it is the reason the rebuild is happening. It is
what replaces the co-approval column and what un-welds the money-plus-deadline row. A
release with Story 1 but not Story 2 would be a regression: existing matrices would lose
their co-approvers and their escalation owners with nowhere to put them back.

**Independent Test**: Add two rules to one task — a money rule requiring approval and a
time rule that escalates — and confirm both appear under that task, are edited
independently, and both print in the Export Report.

**Acceptance Scenarios**:

1. **Given** a task with one rule, **When** the consultant presses the add button, **Then**
   a second rule appears under the same task, empty and ready to build.
2. **Given** a task with two rules, **When** the consultant edits the first, **Then** the
   second is unchanged.
3. **Given** a task with two rules, **When** the consultant deletes one, **Then** the other
   remains and the task is still listed.
4. **Given** a task that needs two signatures, **When** the consultant adds a second
   approval rule above a higher amount, **Then** the matrix expresses that without any
   separate co-approval concept.

---

### User Story 3 - Existing matrices survive the change (Priority: P1)

A consultant who filled in an Authority Matrix before this change opens it afterwards and
finds everything they entered still there, expressed as rules. Nothing they typed is lost
and nothing is silently reinterpreted.

**Why this priority**: P1 because this is client work already delivered. Losing a threshold
or an escalation owner from a signed-off process pack is a business failure, not a bug.
The feature cannot ship without it.

**Independent Test**: Take a matrix containing every combination the old shape allowed —
amount only, turnaround only, amount plus turnaround, co-approval, escalation — convert
it, and confirm every value is still readable and the rule sentences say the same thing.

**Acceptance Scenarios**:

1. **Given** a task with an amount, a direction and an approver, **When** it is converted,
   **Then** it becomes one money rule requiring approval from that same person.
2. **Given** a task with an amount and also a turnaround and escalation owner, **When** it
   is converted, **Then** it becomes two rules — a money rule requiring approval and a time
   rule that escalates — and no value is dropped.
3. **Given** a task with a co-approver above a higher amount, **When** it is converted,
   **Then** that becomes a second approval rule naming the co-approver at that amount.
4. **Given** a task marked as needing no approval, **When** it is converted, **Then** it
   still reads as needing no approval.
5. **Given** a task that was skipped, **When** it is converted, **Then** it is still
   skipped.

---

### User Story 4 - The rules reach every document (Priority: P2)

A consultant exports a client pack. The Authority section of the report, the slide deck and
the spreadsheet all show the task's rules — all of them, in order — reading the same as
they do on screen.

**Why this priority**: P2 rather than P1 only because it follows mechanically once the
rules exist and are ordered. It still ships in the same release: a pack that disagrees with
the screen is worse than no pack.

**Independent Test**: Build a task with two rules, export the report, the deck and the
spreadsheet, and confirm both rules appear in each, in the same order as on screen.

**Acceptance Scenarios**:

1. **Given** a task with two rules, **When** the Export Report is previewed or printed,
   **Then** both rule sentences appear under that task.
2. **Given** the same task, **When** the slide deck is exported, **Then** both rules appear.
3. **Given** the same task, **When** the Authority spreadsheet is downloaded, **Then** both
   rules appear as separate readable entries.
4. **Given** a decision step on the Process Map with a money rule, **When** the map is
   drawn, **Then** the decision still shows its gate figure.

---

### Edge Cases

- A task with **no rules at all**: the matrix still lists the task, shows that it has no
  rules, and offers the add button. Validation still tells the consultant if that task
  needs a decision recorded.
- A rule with a **consequence but nobody named**: the matrix flags it, the same way an
  approver-less task is flagged today. A rule that names nobody is an unfinished rule.
- A rule with **a figure but no direction**, or a direction but no figure: flagged as
  incomplete rather than silently printing a half-sentence into a client pack.
- A **decision step carrying several rules** on the Process Map: the diamond has room for
  one gate line, so it shows the first money rule's figure (see Assumptions).
- **Deleting the last rule** on a task: allowed. The task returns to having no rules.
- A **very long list of rules** on one task: the matrix stays readable and the rules stay
  in a stable, explicit order rather than an order that shifts between page loads.
- A **Viewer** opening the matrix: sees every rule and every figure, and none of the
  buttons that build, change or delete one.

## Requirements *(mandatory)*

### Functional Requirements

**Building a rule**

- **FR-001**: A rule MUST turn on exactly one of two things: an amount of money, or an
  elapsed time. The consultant chooses which with two clearly-labelled controls.
- **FR-002**: Choosing Money MUST present a currency figure and no turnaround figure;
  choosing Time MUST present a turnaround in days and no currency figure.
- **FR-003**: Switching a rule between Money and Time MUST NOT silently keep a figure that
  belonged to the other measure.
- **FR-004**: A rule MUST offer the same direction choices the matrix offers today,
  including the option that means "no rule applies to this task", which MUST continue to
  dim the row.
- **FR-005**: A rule MUST record what happens when it fires: either that the task needs
  approval, or that it escalates.
- **FR-006**: A rule MUST record who that consequence lands on, chosen from the workspace's
  existing roles and people.
- **FR-007**: The matrix MUST show, under each rule, a plain-language sentence stating what
  the rule does, and that sentence MUST update as the rule is edited.
- **FR-008**: The column carrying the consequence MUST be labelled "Then".

**Several rules per task**

- **FR-009**: A task MUST be able to carry any number of rules, including none.
- **FR-010**: The consultant MUST be able to add a rule to a task from the matrix.
- **FR-011**: The consultant MUST be able to delete any single rule without affecting the
  task's other rules.
- **FR-012**: Editing one rule MUST NOT change any other rule.
- **FR-013**: A task's rules MUST have a stable, explicit order that is the same on every
  surface and on every page load.
- **FR-014**: The matrix MUST NOT offer a separate co-approval concept; a second signer is
  expressed as a second approval rule.

**Existing data**

- **FR-015**: Every Authority Matrix that exists when this ships MUST be converted so that
  no recorded threshold, direction, turnaround, approver, co-approver or escalation owner
  is lost.
- **FR-016**: A task that recorded both an amount and a turnaround MUST convert into two
  rules — one for each — rather than one rule that drops half the information.
- **FR-017**: A task that recorded a co-approver MUST convert into a second approval rule
  naming that co-approver.
- **FR-018**: A task that recorded no approval requirement, or that was skipped, MUST still
  read that way after conversion.
- **FR-019**: Conversion MUST be safe to run against a database that has already been
  converted.

**Validation**

- **FR-020**: The matrix MUST tell the consultant which tasks still need a decision
  recorded, as it does today.
- **FR-021**: A rule that names a consequence but nobody to carry it MUST be reported as
  incomplete.
- **FR-022**: A rule missing its figure or its direction MUST be reported as incomplete.

**Everywhere the rules are read**

- **FR-023**: The Export Report preview and its printed output MUST show every rule on a
  task, in the task's rule order.
- **FR-024**: The slide deck export MUST show every rule on a task, in the same order.
- **FR-025**: The Authority spreadsheet and document downloads MUST show every rule on a
  task, in the same order.
- **FR-026**: A decision step on the Process Map MUST continue to show a gate figure when
  the step carries a money rule.

**Access**

- **FR-027**: A Viewer MUST see every rule and every figure, and MUST NOT be offered any
  control that adds, changes or deletes one.

### Key Entities

- **Authority Rule**: One governance statement about one task — what it turns on (an amount
  or an elapsed time), the figure, which side of the figure it fires on, what happens then
  (approval or escalation), and who that lands on. Belongs to exactly one task and carries
  its position in that task's list of rules.
- **Task**: Unchanged — a process step, or an activity attached to one. Now the owner of an
  ordered list of rules rather than of a single fixed set of authority fields.
- **Role / Person**: Unchanged, and still shared across the Process Map, RACI and Authority
  views. A rule's consequence names one of these.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can express a task that needs two signatures at different
  amounts, which the matrix could not express before without the special-purpose
  co-approval column.
- **SC-002**: A row in the matrix shows only the fields its rule actually uses — a money
  rule never displays an empty turnaround field, and vice versa.
- **SC-003**: Every value present in an Authority Matrix before the change is still
  readable after it, across a set of matrices covering every combination the old shape
  allowed.
- **SC-004**: A task's rules read identically on screen, in the report, in the slide deck
  and in the spreadsheet, in the same order.
- **SC-005**: A consultant can add a second rule to a task in a single action from the
  matrix, without leaving the page.
- **SC-006**: The matrix remains fully operable with a keyboard alone and meets the
  project's accessibility bar, including the two new choice controls.
- **SC-007**: A Viewer sees the same rules and figures an Editor sees, and none of the
  controls that change them.

## Assumptions

- **All five directions are offered for both measures.** "Below 2 days" is unusual but has
  legitimate uses (an expedite path), and restricting the choice by measure would add a
  rule the user did not ask for. The wording of the rule sentence adapts to the measure.
- **A decision step on the Process Map shows its first money rule's figure.** The diamond
  has room for one line, and the figure a decision gates on is a money threshold, so a
  money rule is the right one to show. A step with only time rules shows no gate line, as a
  step with no threshold does today.
- **Rule order is the order the consultant created them in**, and can be relied on by the
  report, deck and spreadsheet. Reordering rules within a task is not in this feature.
- **"Needs approval" and "Escalates" are the only two consequences.** The user named these
  two; no third kind is introduced.
- **The turnaround figure stays in whole days**, as today.
- **Existing role and person pickers are reused** rather than redesigned.
- **The conversion of existing data runs automatically wherever the application is already
  deployed**, rather than requiring anyone to run anything by hand.

## Out of Scope

- **Emailing an escalation owner when a turnaround is missed.** The user asked for this and
  then withdrew it, for the right reason: the application documents processes rather than
  running them, so nothing in it knows that a real deadline has passed on a real purchase
  order. There is no event to send an email about. Revisiting it means first deciding where
  that event would come from.
- Reordering a task's rules after they are created.
- Any change to the RACI matrix, the Process Map editor, or the Org Directory.
