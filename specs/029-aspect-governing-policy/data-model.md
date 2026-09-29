# Data Model: A Governing Policy for Every Aspect

## Changed entity

```prisma
model GovernancePolicyDraft {
  // ...existing fields unchanged...
  /// Spec 029: the aspect this policy governs, if any. Unique: an aspect has
  /// at most one governing policy and a policy governs at most one aspect.
  /// SetNull: deleting the aspect keeps the policy.
  governsAspectId String?           @unique
  governsAspect   GovernanceAspect? @relation("AspectGoverningPolicy", fields: [governsAspectId], references: [id], onDelete: SetNull)
}

model GovernanceAspect {
  // ...existing fields unchanged...
  governingPolicy GovernancePolicyDraft? @relation("AspectGoverningPolicy")
}
```

Additive migration (one nullable column, a unique index, a foreign key).

## Server actions (`lib/actions/governing-policy.ts`, NEW — all EDITOR)

| Action | Input | Rules |
|---|---|---|
| `setGoverningPolicy` | workspaceId, aspectId, policyId \| null | Aspect and policy must be this workspace's. A policy already governing another aspect is refused, naming it. Replacing clears the previous one's link. Logs "Set as governing policy for X" / "Removed as governing policy for X". |
| `createGoverningPolicy` | workspaceId, aspectId, templateId? or title+body | Aspect must have none. Creates a Draft (status EDITED, handManaged) with version 1, linked. Logs "Added as governing policy for X". |
| `draftGoverningPolicyWithAi` | workspaceId, aspectId | Profile gate; AI unavailable handled like the assessment. Aspect must have none. Same create + log. |

`generateGovernanceAssessment` additionally creates the returned
`governingPolicy` when the aspect has none (not handManaged, like other
drafted policies), and its activity summary notes it.

## Domain (NEW, pure)

- `lib/domain/policy-templates.ts`: `POLICY_TEMPLATES`, `rankTemplates(aspectName)`, `fillTemplate(template, companyName)`.
- `lib/domain/governing-policy.ts`: `aspectPolicyState(policy)`.
