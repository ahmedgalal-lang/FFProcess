# Research: Custom Governance Aspects

## Decision 1: A new `GovernanceAspect` model, not a repurposed enum

**Decision**: Add `model GovernanceAspect { id, workspaceId, name, createdAt }`,
`@@unique([workspaceId, name])` (FR-007), workspace-scoped
(FR-001). `GovernanceAssessment.focusArea` (today a
`GovernanceFocusArea` enum column) is replaced by `aspectId String`, a
foreign key to this new model, `onDelete: Cascade` (an aspect's own
assessment — summary + checklist — dies with it, FR-004), and
`@@unique([aspectId])` (one assessment per aspect, replacing today's
`@@unique([workspaceId, focusArea])` — trivially true once the aspect
itself is already workspace-scoped).

**Rationale**: A Prisma enum is a fixed, schema-wide set of values — the
opposite of what "add a client-specific one" requires. A real per-workspace
table is the only way an aspect can be created, renamed, and deleted at
runtime. Naming it `GovernanceAspect` (matching the spec's own vocabulary
and the user's own word, "aspects") rather than reusing the enum's name
(`GovernanceFocusArea`) avoids a collision during the migration window and
gives every future reader one unambiguous name for the entity.

**Alternatives considered**: Keeping the enum and adding a *separate*,
parallel "custom aspect" table only for consultant-added ones — rejected
outright by the spec itself (FR-006: no built-in/custom distinction). Every
aspect must be the same kind of row.

## Decision 2: Deleting an aspect must *not* rely on the schema's existing checklist-item-delete cascade

**Decision**: `GovernancePolicyDraft.checklistItem` is `onDelete: Cascade`
today — deleting a single checklist item (the existing
`deleteGovernanceChecklistItem` action) deliberately takes its drafted
policy with it. Deleting an *aspect*, however, must leave every policy it
had sourced intact (FR-005) — a stricter guarantee than deleting one item
already gives. So `deleteGovernanceAspect` cannot just delete the
assessment and let cascades run: before deleting it, the action must
explicitly clear `checklistItemId` (to null) on every policy draft linked
to one of the assessment's checklist items. Only then does deleting the
assessment (cascading its checklist items) become safe — nothing left
pointing at a row about to disappear. A linked risk needs no equivalent
step: `GovernanceRisk.sourceItem` is already `onDelete: SetNull`, so it
survives a checklist item's deletion automatically, exactly as it already
does for `deleteGovernanceChecklistItem`.

**Rationale**: This is the one place the spec's own requirement (FR-005)
is *stricter* than an already-shipped, adjacent action's behavior
(deleting one checklist item still takes its policy with it — untouched,
out of scope). Missing this distinction would silently delete every policy
an aspect had ever drafted the moment a consultant removed it — exactly the
data loss FR-005 exists to prevent.

**Alternatives considered**: Changing `GovernancePolicyDraft.checklistItem`
to `onDelete: SetNull` globally, so both deletion paths behave the same —
rejected; `deleteGovernanceChecklistItem`'s existing cascade-the-policy
behavior is explicit, documented, pre-existing product behavior this spec
does not touch (Assumptions: "out of scope: any change to what an
aspect's... checklist... actually are or how they are... individually
edited").

## Decision 3: Existing-data migration seeds every workspace's seven aspects, in the same raw-SQL migration that adds the table

**Decision**: One Prisma migration does all of the following, in order:
1. Create `governance_aspects`.
2. `INSERT INTO governance_aspects (id, "workspaceId", name, "createdAt") SELECT gen_random_uuid(), w.id, label, now() FROM workspaces w CROSS JOIN (VALUES ('BOARD_STRUCTURE','Board Structure'), …) AS f(value, label)` — one row per workspace per one of the seven legacy values, named exactly as
   `GOVERNANCE_FOCUS_AREA_LABEL` already labels them today.
3. Add `aspectId` (nullable at first) to `governance_assessments`; backfill
   it by joining each assessment's `(workspaceId, focusArea)` to the
   matching new aspect row; then make it `NOT NULL` and add the FK.
4. Drop the old `focusArea` column and the `GovernanceFocusArea` enum type.

**Rationale**: FR-008 is explicit and absolute — every existing workspace
must read exactly as it does today the moment this ships. Seeding all
seven per workspace (not just the ones with an existing assessment) is
what makes the tab list itself unchanged on day one: today, all seven tabs
already show for every workspace regardless of whether anything has been
generated for them yet (`GOVERNANCE_FOCUS_AREAS` is rendered directly by
the client panel, independent of which ones have real data) — the migrated
aspect list must reproduce that, not just backfill the ones already in use.

**Alternatives considered**: Seeding an aspect row lazily, only the first
time something references it — rejected; it would make a workspace's tab
list depend on what happens to already exist in it, silently hiding tabs
for aspects nobody has generated yet, a visible regression FR-008
forbids.

## Decision 4: Every existing action's `focusArea: z.enum(FOCUS_AREAS)` becomes `aspectId: z.string().min(1)`, ownership-checked like every other id

**Decision**: `generateGovernanceAssessment`, `addGovernanceChecklistItem`,
and any other action currently validating a fixed focus-area value against
a static Zod enum instead take an `aspectId` and look the row up
(`prisma.governanceAspect.findUnique`), returning `notFound()` when it's
missing or belongs to a different workspace — the exact pattern every
other id-taking action in this file already uses (`updateGovernanceRisk`,
`updatePolicyDraft`, etc.).

**Rationale**: A fixed Zod enum can't validate an open-ended, per-workspace
list; an ownership-checked id lookup is simply this file's existing
pattern for everything else that isn't a closed set. No new validation
idiom is introduced.

## Decision 5: The client panel's tabs come from a prop, not an import

**Decision**: `lib/domain/governance-focus-areas.ts`'s static
`GOVERNANCE_FOCUS_AREAS` array is removed. `page.tsx` queries
`prisma.governanceAspect.findMany({ where: { workspaceId }, orderBy:
{ createdAt: "asc" } })` (FR-002's "appends after the existing ones" falls
out of ordering by creation time) and passes the list to
`GovernanceAssessmentPanel` as a prop; the panel's tab bar renders from
that prop instead of a hardcoded import, plus new inline controls (add,
rename, delete) beside it, matching the add/edit/delete affordances
already on this same page for checklist items, risks, and policies.

**Rationale**: The whole point of this feature is that the list is no
longer fixed at build time — it has to come from the database, per
workspace, the same way risks and policies already do.

## Decision 6: `lib/domain/governance-findings.ts` and the AI generator are untouched

**Decision**: No change to `governance-findings.ts` (reconciliation logic)
or `lib/ai/governance-generator.ts` (the prompt/model call). Both already
operate on a focus area only through its *label* (a plain string, passed
in by the caller) — swapping where that string comes from (a fixed
`Record` lookup vs. a `GovernanceAspect.name` column) is invisible to
them.

**Rationale**: Confirms the spec's own Assumptions ("out of scope: any
change to what an aspect's assessment... actually are or how they are
generated") — verified directly against the source rather than assumed.
