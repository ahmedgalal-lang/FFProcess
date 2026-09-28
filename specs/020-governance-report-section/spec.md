# Feature Specification: Governance & Risk in the Exported Report

**Feature Branch**: `020-governance-report-section`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "The Risk Register, Policy Library, and governance assessment content don't appear anywhere in the exported Export Report pack (PDF or PPTX) — only Key Control Points and KPIs do, which are a different, per-process thing derived from the Authority Matrix. Add the workspace's governance content as a new, toggleable section of the report, and make sure it shows up in the arrangement/checklist screen where a consultant picks what's included, the same as every other section."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Risk Register appears in the exported report (Priority: P1) 🎯 MVP

A consultant has built up a Risk Register on the Governance page over the course of an engagement. When they export the report pack for a client or their own firm's records, none of that shows up — the client never sees the risks that were found. They need the Risk Register to appear as its own section of the exported report, and to be able to turn it on or off from the same arrangement screen where they already choose which other sections go in.

**Why this priority**: The most-requested piece, and the one with the clearest business consequence — a risk a client should be formally told about today has no path into anything they're actually handed.

**Independent Test**: With at least one risk on the register, export the report (both the PDF/print pack and the PPTX deck) and confirm the Risk Register appears, listing every risk with its likelihood, impact, status, and owner. Turn the new section off from the arrangement screen and confirm it's excluded from both export formats.

**Acceptance Scenarios**:

1. **Given** a workspace with risks on its Risk Register, **When** a consultant exports the report (PDF or PPTX), **Then** a Governance & Risk section appears listing every risk with its title, likelihood, impact, status, and owner (or "Unassigned" when it has none).
2. **Given** the arrangement/checklist screen a consultant already uses to choose what's in the report, **When** they view it, **Then** the new Governance & Risk section is listed there, on by default, exactly like every other section.
3. **Given** the section is turned off on the arrangement screen, **When** the report is exported, **Then** it does not appear, in either export format.
4. **Given** a workspace with no risks at all, **When** the section is included, **Then** it says so plainly rather than rendering an empty table.
5. **Given** a report link that only includes some of a workspace's processes, **When** the Governance & Risk section renders, **Then** it still shows the workspace's whole Risk Register — risks aren't tied to any single process, so which processes were picked for this report doesn't filter them.

---

### User Story 2 - The Policy Library joins the same section (Priority: P2)

Alongside the risks, the client should see what policies exist and where each one stands — not the full text of every policy (that would make the pack unwieldy), but a clear index: what it's called, its current status, and, once published, when it took effect.

**Why this priority**: Meaningful on its own once the section exists from User Story 1 — same section, same toggle, no new arrangement control — and it's the second half of what was actually asked for ("the risk, policies, etc").

**Independent Test**: With at least one policy in the Policy Library, export the report and confirm the same Governance & Risk section now also lists every policy by title and status (and effective date, if published), without the section splitting into two separately-toggleable pieces.

**Acceptance Scenarios**:

1. **Given** a workspace with policies in its Policy Library, **When** the Governance & Risk section is included in an export, **Then** it lists every policy's title, its current status, and — once it has one — its effective date.
2. **Given** a policy that has not been published, **When** it appears in this list, **Then** its effective date is left blank rather than showing something misleading.
3. **Given** the same section, **When** viewed in either export format, **Then** the Risk Register and the Policy list appear together under the one Governance & Risk toggle — there is no separate on/off control for policies alone.

---

### User Story 3 - Each aspect's assessment summary rounds out the section (Priority: P3)

The Governance page's AI-assisted assessments (one per aspect — Board Structure, Ethics Policy, and so on) each carry a written executive summary. Including those alongside the risks and policies turns the section from a set of lists into an actual governance narrative a board could read.

**Why this priority**: The most complete version of the section, but the least urgent — Users 1 and 2 already deliver the literal ask (risks and policies); this is additive polish that rounds it out into something closer to a real governance report.

**Independent Test**: With at least one aspect carrying a generated or hand-written summary, export the report and confirm each such aspect's summary appears in the section, labeled by aspect name; confirm an aspect with no assessment yet is simply skipped, not shown as empty.

**Acceptance Scenarios**:

1. **Given** an aspect with a generated or hand-edited executive summary, **When** the Governance & Risk section is included, **Then** that summary appears, labeled with the aspect's name.
2. **Given** an aspect that has never been assessed, **When** the section renders, **Then** that aspect is simply absent from it — not shown as an empty placeholder.

---

### Edge Cases

- What happens when the whole workspace has no governance content at all (no risks, no policies, no assessments)? The section, if turned on, says plainly that nothing has been recorded yet, rather than appearing broken or being silently skipped without explanation.
- What happens to a risk or policy added to the Governance page after a report link was generated? The report reflects live data at export/view time, the same as every other section of this report already does — there is no separate snapshot behavior introduced for this section.
- What happens for a Viewer exporting the report? The same access this report export already requires today applies unchanged — this feature adds a new section, not a new access rule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add a new report section, workspace-scoped (not tied to which processes were selected for a given report), listing the workspace's Risk Register.
- **FR-002**: The Risk Register listing MUST show each risk's title, likelihood, impact, status, and owner (or a clear "unassigned" indication when it has none).
- **FR-003**: The same section MUST also list every policy in the workspace's Policy Library, showing its title, current status, and effective date once it has one.
- **FR-004**: The same section MUST also show each aspect's executive summary, for every aspect that currently has one, labeled by aspect name.
- **FR-005**: The new section MUST appear in the report arrangement/checklist screen a consultant already uses to choose what's included, exactly like every other existing section — visible, nameable, and independently toggleable on or off.
- **FR-006**: The new section MUST default to included (on) for both new and already-arranged reports, matching how every other section already added to this catalogue behaves for arrangements made before it existed.
- **FR-007**: Turning the section off on the arrangement screen MUST exclude it from both export formats this report already produces (the printable/PDF pack and the slide deck).
- **FR-008**: When the section is included but the workspace has nothing to show for a given part of it (no risks, no policies, no assessed aspects), that part MUST say so plainly rather than rendering as blank or broken.
- **FR-009**: The section MUST NOT include a policy's full body text — only the index described in FR-003.
- **FR-010**: The section MUST appear in both export formats this report already produces (PDF/print and the slide deck), not only one of them.

### Key Entities

- **Governance & Risk report section**: a new, single, workspace-scoped section of the existing exportable report, combining a read-only view of the workspace's Risk Register, Policy Library index, and per-aspect assessment summaries. It carries one on/off toggle, not separate ones for each part.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every risk on a workspace's Risk Register at export time appears in the exported report when this section is on, with zero cases of a risk existing on the Governance page but missing from an export that included this section.
- **SC-002**: A consultant can turn this section on or off from the same screen, in the same way, as every other report section — no separate control, no different interaction.
- **SC-003**: The section renders correctly (with an honest "nothing here yet" state, not an error or a blank gap) for a workspace with no governance content at all.
- **SC-004**: The section's content — Risk Register, Policy index, assessment summaries — is identical in substance between the PDF/print export and the PPTX export, differing only in layout.

## Assumptions

- "Policies" in the report means an index (title, status, effective date) — full policy body text is explicitly out of scope for this feature (Requirement FR-009); including full text is a reasonable, separate follow-on if ever wanted.
- The phased governance checklist (Immediate/Near-term/Long-term action items per aspect) is not included in this report section — it reads as an internal working list for the consultant, not a client-facing report to include; only the executive summary represents each aspect here.
- This section is workspace-scoped like Org Structure, Helicopter View, and Value Chain already are, not per-process like the existing "Governance, Controls & Metrics" section (Key Control Points & KPIs) — the two are different, both keep their current names and behavior, and this feature does not rename or otherwise change the existing per-process one.
- Where this new section sits in the default report order is an implementation detail left to planning, not a product requirement here — it defaults to *included*, per FR-006, regardless of position.
