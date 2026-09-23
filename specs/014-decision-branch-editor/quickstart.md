# Quickstart: Validating the Decision Branch Editor

## Prerequisites

- Dev database seeded: `pnpm db:seed` (seeds Acme Industrial's Purchase-to-Pay, PUR101,
  which already has an "Approve PO?" decision step).
- Dev server running: `pnpm dev`.

## Manual validation

1. **The editor is Decision-only (User Story 1)**
   Sign in → Acme Industrial → Purchase-to-Pay → Process Map → Steps List → Add step.
   - Leave Type as Task: the plain single "Connects from" / "Connector label" fields show,
     no Yes/No editor.
   - Change Type to Decision: the branch editor appears in its place, with a Yes box and a
     No box. Change Type back to Task: the editor disappears, the plain fields return.
   - Open Edit on an existing Task, Start, or End step: no branch editor is offered there
     either.

2. **A new branch to a new step, and to an existing step (User Story 2)**
   Add a step, name it "Over $10,000?", set Type to Decision.
   - In the Yes box, choose "create a new step," name it "Escalate to CFO." Submit.
   - Open Edit on "Over $10,000?" again, open its branch editor (still there from the
     existing outgoing connection), and in the No box choose "link to an existing step" →
     pick "Create Purchase Order" (a step earlier in the list). Save.
   - The Steps List now shows both connections; the live canvas (Process Map diagram
     toggle) draws both, each carrying its own label, with the No branch's line running
     back up to an earlier step rather than forward.

3. **More than two branches (User Story 3)**
   On the same "Over $10,000?" decision, reopen the branch editor and add a third branch
   ("Needs board approval" → a new step). Confirm all three show, each independently
   editable and removable, and reopening the editor later still shows all three.

4. **Existing data is undisturbed (Edge Cases, FR-009/FR-014)**
   Find (or create via SQL, matching a pre-feature shape) a Decision step whose outgoing
   connections carry labels other than "Yes"/"No" — e.g. "Approved"/"Rejected". Open its
   branch editor: both existing connections appear as filled boxes with their own labels
   intact, not renamed or duplicated.

5. **Printed and live rendering are unaffected (SC-005)**
   Export Report → preview the process containing a multi-branch decision. The printed
   map's branch labels on the decision's rail/elbow look exactly as they did before this
   feature (spec 013's rendering is untouched) — only how the underlying connections were
   created has changed.

6. **Access parity (FR-015)**
   Sign in as a Viewer on the same workspace. Open the Steps List: no Edit affordance is
   offered on any step (existing behavior), so the branch editor is unreachable — same as
   every other write control on this page.

## Automated validation

- `pnpm exec vitest run` — no new pure domain logic is introduced (research.md Decision 1),
  so no new unit test target; existing `process-graph.test.ts` coverage of
  `validateConnections` is unaffected and re-run as part of the full suite.
- `pnpm exec playwright test` — a new or extended e2e spec drives the two-box editor through
  the real Steps List: creating a branch to a new step, creating a branch to an existing
  step, editing a branch's label, removing a branch, and confirming the plain connector
  field (not the branch editor) is what a Task/Start/End step shows.
