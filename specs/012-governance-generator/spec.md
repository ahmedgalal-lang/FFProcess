# Feature Specification: AI Governance Framework Generator

**Feature Branch**: `claude/process-mapping-raci-tool-v1i9lb`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "we need to build initial section for the rest of the
governance (risk management, compliance, data, etc..)" — followed by a supplied system
prompt for a "Corporate Governance Evaluation & Generation Tool": inputs of Company
Size, Industry/Sector & Jurisdiction, and Target Governance Focus; an evaluation
framework of five pillars (Accountability, Transparency, Fairness, Responsibility,
Independence); and three output types (Executive Summary, phased Governance Checklist,
Draft Policies), in an executive, non-generic tone mapped to the company's actual size
and industry.

## Context

The workspace already has a Governance page, but it covers only what the rest of the
product already knows: Key Control Points derived from each process's Authority Matrix,
and manually-entered KPIs. It says nothing about risk management, compliance, or data
governance — the things a consultancy is also expected to stand up for a client, and
which don't derive from a Process Map at all. That is the gap this feature closes: a
new, AI-assisted section that evaluates and drafts the governance framework itself —
board structure, risk & controls, ethics, compensation, ESG — rather than summarising
process data that already exists.

The product already has exactly this shape of feature once: **AI Process Review**
(`lib/ai/process-review.ts`) sends a structured prompt to Gemini via a shared helper
(`generateStructured`, `lib/ai/gemini.ts`) and gets back a fixed JSON shape, which is
then persisted as editable, dismissible rows (`ReviewFinding`) scoped to what it
reviewed. This feature is the same shape at workspace level instead of process level:
same shared AI helper, same "generate → persist → edit/dismiss" life cycle, not a new
integration pattern.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate a governance assessment for a client engagement (Priority: P1)

A consultant opens a new client's workspace, sets its governance profile — company
size, industry/sector, jurisdiction — and asks for an assessment of one governance
focus area (say, Risk & Internal Controls). The tool returns an executive summary
scored against the five pillars, a checklist grouped into Immediate / Near-Term /
Long-Term, and a list of draft policies it recommends starting.

**Why this priority**: This is the feature. Everything else is what makes the output
usable rather than a one-shot toy.

**Independent Test**: Set a workspace's governance profile, request an assessment for
one focus area, and confirm all three output types come back and are specific to the
stated size/industry rather than generic advice.

**Acceptance Scenarios**:

1. **Given** a workspace with an industry and a governance profile set, **When** a
   consultant requests an assessment for a chosen focus area, **Then** the tool returns
   an executive summary, a checklist grouped by Immediate/Near-Term/Long-Term, and a
   list of recommended draft policies, all referencing the stated company size and
   industry rather than reading as generic advice.
2. **Given** the same request, **When** the summary is shown, **Then** it is framed
   against the five pillars (Accountability, Transparency, Fairness, Responsibility,
   Independence) rather than as an unstructured paragraph.
3. **Given** a workspace with no governance profile set yet, **When** a consultant
   tries to request an assessment, **Then** they are asked to set the profile first
   rather than getting a generic, industry-blind result.

---

### User Story 2 - Open and act on a draft policy (Priority: P2)

A checklist item recommends a Whistleblower Policy. The consultant opens it and gets a
professional, template-ready draft they can hand to the client or adapt, not a
paragraph telling them to "consider adding a whistleblower policy."

**Why this priority**: The checklist alone tells a consultant what to do; the draft
policy is what lets them actually do it in the same sitting, which is most of the
value over doing this by hand.

**Independent Test**: From a checklist item recommending a policy, open its draft and
confirm it reads as a real policy document (sections, defined terms, a place for the
client's own details) rather than a summary of what the policy should contain.

**Acceptance Scenarios**:

1. **Given** a generated checklist that recommends a specific policy, **When** the
   consultant opens it, **Then** a full draft of that policy is shown, formatted as a
   document a client could review, not as advice about the policy.
2. **Given** a draft policy, **When** the consultant re-reads it later, **Then** it is
   still there — regenerating the assessment must not silently discard a draft someone
   already has open or has started editing.

---

### User Story 3 - Findings persist, and a stale one doesn't come back on its own (Priority: P2)

The assessment for a workspace is not a one-shot report: a consultant runs it early in
an engagement, works through the checklist over weeks, and marks items done or not
relevant. Re-running the assessment later (say, after the client's industry or size
profile changes) must not silently wipe that progress or resurrect something already
dismissed.

**Why this priority**: Mirrors exactly what AI Process Review already had to solve
(`review-findings.ts`'s "a dismissed finding doesn't come back" rule) — getting it
wrong here has the same cost: a consultant's tracked progress disappearing.

**Independent Test**: Mark a checklist item done, re-run the assessment, and confirm
the marked item is not silently reset or duplicated.

**Acceptance Scenarios**:

1. **Given** a checklist item marked done or dismissed, **When** the assessment is
   re-run, **Then** that item's status is preserved rather than reset to open.
2. **Given** an assessment already run for a focus area, **When** it is re-run,
   **Then** the new run's items are reconciled against the existing ones (matched,
   not duplicated) the same way AI Process Review findings already are.

---

### Edge Cases

- **AI is not configured for this deployment** (no API key) — the existing AI Review
  and Template Generation features already handle this gracefully rather than erroring;
  this feature must fail the same way, not differently.
- **A focus area with genuinely little to say** (e.g. ESG for a two-person pre-seed
  startup) — the tool should say so plainly rather than inventing filler to fill three
  output sections.
- **A workspace's industry is blank.** The existing `Workspace.industry` field is
  optional; this feature needs it (and the new size/jurisdiction fields) set to produce
  a grounded result, so it has to ask for them rather than silently generating something
  generic.
- **Re-running while a previous run is still being reviewed** — same reconciliation
  rule as User Story 3, not a special case.
- **A draft policy the consultant has started editing**, then the assessment is
  re-run — must not overwrite an edited draft with a freshly generated one out from
  under the consultant, mirroring the "EDITED" status AI Process Review findings
  already have.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a consultant set a workspace's governance profile:
  company size, and jurisdiction, in addition to the industry the workspace already
  records.
- **FR-002**: The system MUST let a consultant request a governance assessment for one
  chosen focus area (Board Structure, Risk & Internal Controls, Ethics Policy,
  Compensation, or ESG) at a time.
- **FR-003**: The system MUST refuse to generate an assessment until the workspace's
  governance profile (size, industry, jurisdiction) is set, and MUST say why rather
  than generating a generic result silently.
- **FR-004**: Each assessment MUST produce three outputs: an executive summary framed
  against the five governance pillars, a checklist grouped into Immediate/Near-Term/
  Long-Term, and a list of recommended draft policies.
- **FR-005**: Each checklist item that recommends a specific policy MUST link to a full
  draft of that policy, not merely describe it.
- **FR-006**: Checklist items and draft policies MUST persist across sessions and be
  individually markable (e.g. done, dismissed) independent of re-running the assessment.
- **FR-007**: Re-running an assessment for a focus area MUST reconcile against existing
  checklist items and drafts for that focus area rather than replacing them outright —
  an item already marked done or dismissed must not silently reappear as open, and a
  draft policy already edited by hand must not be silently overwritten.
- **FR-008**: The system MUST use the same AI integration path the product already has
  (the shared structured-output helper) rather than a new one.
- **FR-009**: Running an assessment MUST require at least EDITOR access to the
  workspace, since it persists new content; viewing an existing assessment follows the
  same read access every other workspace view already uses.
- **FR-010**: When the AI integration is not configured for a deployment, the feature
  MUST say so plainly, the same way AI Process Review and Template Generation already
  do, rather than erroring or silently doing nothing.

### Key Entities

- **Governance Profile**: a workspace's company size and jurisdiction, alongside its
  existing industry — the inputs an assessment is grounded in.
- **Governance Assessment**: one run, for one workspace and one focus area — holds the
  executive summary and is the parent of its checklist items.
- **Governance Checklist Item**: one recommended action, with a phase
  (Immediate/Near-Term/Long-Term), a status (open/done/dismissed), and optionally a
  linked draft policy.
- **Draft Policy**: a full policy document tied to a checklist item, editable, and
  preserved independently of later assessment runs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consultant can go from an unset governance profile to a complete
  three-part assessment (summary, checklist, draft policies) for one focus area in
  under three actions (set profile, choose focus, generate).
- **SC-002**: Every generated summary references the workspace's actual stated size and
  industry by name, measured across a sample of runs across different focus areas —
  not a template with the same sentences regardless of input.
- **SC-003**: Marking a checklist item done and re-running the assessment leaves that
  item done, with no duplicate of it created, in 100% of cases.
- **SC-004**: A draft policy a consultant has edited is never silently replaced by a
  regeneration.

## Assumptions

- This is workspace-level, not process-level: a governance framework covers the client
  organization as a whole, matching where the existing Governance page already sits
  (aggregated across every process in the workspace) rather than being attached to one
  process.
- The supplied system prompt's five pillars and three output types are taken as given —
  they are the one part of this request that was fully specified rather than left to
  design.
- "Target Governance Focus" is one selection per run (mirroring how a consultant runs
  AI Process Review once per process, not once for every area at once), not a single
  request covering all five areas simultaneously — keeps each run scoped and each
  output readable, and matches FR-002.
- Regeneration reconciliation follows the same rule `review-findings.ts` already
  implements for AI Process Review (match by normalized title, don't recreate a
  dismissed one) rather than a new rule invented for this feature.
- No new AI provider or SDK: this reuses `lib/ai/gemini.ts`'s `generateStructured`,
  the same helper AI Process Review and Template Generation already share.
