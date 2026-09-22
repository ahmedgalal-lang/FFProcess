# Contract: `lib/ai/governance-generator.ts`

Mirrors `lib/ai/process-review.ts` exactly — same `generateStructured` helper, same
shape of module. This file is small on purpose; there's nothing here `process-review.ts`
doesn't already establish the pattern for.

```ts
export type GovernanceChecklistItemResult = {
  phase: "immediate" | "near_term" | "long_term";
  title: string;
  description: string;
  policyTitle: string | null;
  riskTitle: string | null;
};

export type GovernancePolicyResult = { title: string; body: string };

export type GovernanceRiskResult = {
  title: string;
  description: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
};

export type GovernanceAssessmentResult = {
  summary: string;
  checklist: GovernanceChecklistItemResult[];
  policies: GovernancePolicyResult[];
  risks: GovernanceRiskResult[];
};

export type GovernanceAssessmentOutcome =
  | { ok: true; data: GovernanceAssessmentResult }
  | { ok: false; reason: "NOT_CONFIGURED" | "REQUEST_FAILED"; message: string };

export function runGovernanceAssessment(promptText: string): Promise<GovernanceAssessmentOutcome>;
```

## System prompt

The pasted role/pillars/output-shape definition the user supplied, adapted only where
the product's own vocabulary differs from the prompt's (e.g. "Target Governance Focus"
→ the fixed five-area enum FR-002 already names). The five pillars and three
deliverable types are asked for as given — no paraphrasing — per the spec's own
Assumptions.

## Prompt text the caller builds (not the system prompt — the per-run input)

Built the same way `process-review.ts`'s caller builds `promptText`: plain text, not
another schema, naming the workspace's company size, jurisdiction, industry, the chosen
focus area, and — for FR-007's reconciliation to work — the titles already tracked
(open, done, dismissed) so the model doesn't waste output regenerating items the
consultant has already acted on. Built in `lib/actions/governance.ts`, not in this file:
this file only knows how to call the model, not how to gather workspace state.

## What callers may rely on

- Absent `GEMINI_API_KEY` → `{ ok: false, reason: "NOT_CONFIGURED" }`, never a thrown
  error — same contract every other `generateStructured` caller already gets.
- A `policyTitle` on a checklist item, when set, always has a matching entry in
  `policies` — enforced by the schema's structure, not by the caller re-checking, the
  same trust `process-review.ts` places in its own schema today.
- A `riskTitle` on a checklist item, when set, always has a matching entry in `risks`,
  same guarantee.
- No ownership, no status: those are FR-011's "a consultant sets this," never asked of
  the model.
