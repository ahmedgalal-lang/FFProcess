# Contract: `lib/actions/governance.ts`

Server actions, in the same shape every existing action module already uses: Zod input,
`requireWorkspaceAccess`, `ActionResult<T>` return. Modeled on `lib/actions/ai-review.ts`.

```ts
/** FR-001. Sets size/jurisdiction on Workspace; industry is edited where it already is. */
export function setGovernanceProfile(input: {
  workspaceId: string;
  companySize: string;
  jurisdiction: string;
}): Promise<ActionResult<{ id: string }>>;
// Access: EDITOR — a profile edit is a workspace-level write like any other.

/**
 * FR-002/FR-003/FR-004/FR-007. Refuses (VALIDATION_ERROR) when the profile isn't set.
 * Gathers the workspace's profile + industry + this focus area's already-tracked item
 * titles, calls runGovernanceAssessment, reconciles the result against what's stored
 * (governance-findings.ts) so a done/dismissed item or an edited policy survives, and
 * persists: upserts the GovernanceAssessment row for (workspaceId, focusArea), inserts
 * only genuinely new checklist items, reconciles risks the same way (FR-014).
 */
export function generateGovernanceAssessment(input: {
  workspaceId: string;
  focusArea: GovernanceFocusArea;
}): Promise<ActionResult<{ assessmentId: string }>>;
// Access: EDITOR (FR-009) — persists new content.

/** FR-006. Independent of any run. */
export function setChecklistItemStatus(input: {
  workspaceId: string;
  itemId: string;
  status: "OPEN" | "DONE" | "DISMISSED";
}): Promise<ActionResult<{ id: string }>>;
// Access: EDITOR.

/** FR-006/SC-004. Setting `body` also sets status to EDITED, protecting it from FR-007. */
export function updatePolicyDraft(input: {
  workspaceId: string;
  policyId: string;
  body: string;
}): Promise<ActionResult<{ id: string }>>;
// Access: EDITOR.

/** FR-011/FR-012. `sourceItemId` omitted for a hand-added risk. */
export function addGovernanceRisk(input: {
  workspaceId: string;
  title: string;
  description: string;
  likelihood: "LOW" | "MEDIUM" | "HIGH";
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}): Promise<ActionResult<{ id: string }>>;
// Access: EDITOR.

/** FR-011/SC-006. Any field omitted is left unchanged. Setting any field marks the risk hand-managed, protecting it from FR-014 the same way updatePolicyDraft protects a policy. */
export function updateGovernanceRisk(input: {
  workspaceId: string;
  riskId: string;
  status?: "OPEN" | "MITIGATING" | "ACCEPTED" | "CLOSED";
  likelihood?: "LOW" | "MEDIUM" | "HIGH";
  impact?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ownerRoleId?: string | null;
  ownerPersonId?: string | null;
}): Promise<ActionResult<{ id: string }>>;
// Access: EDITOR.
```

## Reading

No dedicated read actions: the Governance page (a Server Component, like every other
workspace page) queries `GovernanceAssessment`/`GovernanceChecklistItem`/
`GovernancePolicyDraft`/`GovernanceRisk` directly with `prisma`, the same way
`governance/page.tsx` already queries `AuthorityAssignment` today. Access: whatever
read access the page itself already requires (VIEWER+, per FR-009's "viewing... follows
the same read access every other workspace view already uses").

## What callers may rely on

- `generateGovernanceAssessment` never deletes a checklist item, a policy, or a risk —
  only inserts new ones and updates the assessment's `summary`. A consultant's tracked
  state (status, hand-edits, hand-added risks) is untouched by construction, not by a
  check the action remembers to run.
- Every action re-derives access from `workspaceId` on every call — no action trusts a
  client-supplied role or a previous check's result, same as every existing action.
