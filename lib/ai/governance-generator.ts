import "server-only";
import { Type, type Schema } from "@google/genai";
import { generateStructured } from "./gemini";

export type GovernanceChecklistItemResult = {
  phase: "immediate" | "near_term" | "long_term";
  title: string;
  description: string;
  /** Non-null when this item recommends a specific draft policy — must match an entry in `policies`. */
  policyTitle: string | null;
  /** Non-null when this item is the action that mitigates a specific risk — must match an entry in `risks`. */
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

/**
 * The user's own system prompt for this feature, kept close to as supplied —
 * the five pillars and three output types are asked for as given, not
 * paraphrased (spec.md Assumptions). Adapted only where the product's own
 * vocabulary differs from the prompt's: "Target Governance Focus" becomes the
 * fixed five-area choice FR-002 already names rather than a free-text field,
 * and the three input parameters map onto the workspace's own profile
 * (industry, governanceCompanySize, governanceJurisdiction) that
 * generateGovernanceAssessment gathers before calling this.
 */
const SYSTEM_PROMPT =
  "You are an expert Corporate Governance Engine, helping a consulting firm assess, build, and optimize a " +
  "client's governance framework. Generate actionable governance documentation, evaluate organizational " +
  "risk, and provide compliance guidance grounded in the company's actual size, industry, and jurisdiction " +
  "— never generic advice that would read the same for any company. " +
  "Evaluate across five pillars: Accountability (clear reporting lines and leadership responsibility), " +
  "Transparency (open reporting, disclosures, and risk visibility), Fairness (equitable treatment of " +
  "shareholders, employees, and stakeholders), Responsibility (legal compliance, regulatory duties, and " +
  "ethical alignment), and Independence (objective oversight free from executive bias). " +
  "Produce three things for the one governance focus area you're given: an executive summary that maps " +
  "explicitly onto those five pillars (a reader should be able to tell which pillar each claim is about), " +
  "a checklist of concrete actions grouped by when they matter (Immediate, Near-Term, Long-Term), and a " +
  "full, professional, template-ready draft for every policy a checklist item recommends — a real document " +
  "with sections and defined terms, not a paragraph describing what the policy should contain. When a " +
  "checklist item is mitigating a specific identified risk, name that risk with a likelihood and an impact. " +
  "Maintain an executive, objective tone. Do not invent facts about the company beyond what you're given, " +
  "and do not pad a focus area with filler when there is genuinely little to say for a company this size — " +
  "say so plainly instead.";

const CHECKLIST_ITEM_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    phase: { type: Type.STRING, enum: ["immediate", "near_term", "long_term"] },
    title: { type: Type.STRING, description: "Short label, under 12 words." },
    description: { type: Type.STRING, description: "What to do and why it matters at this company's size/industry." },
    policyTitle: {
      type: Type.STRING,
      nullable: true,
      description: "Title of a drafted policy this item recommends, matching an entry in `policies`. Omit/null if none.",
    },
    riskTitle: {
      type: Type.STRING,
      nullable: true,
      description: "Title of the risk this item mitigates, matching an entry in `risks`. Omit/null if none.",
    },
  },
  required: ["phase", "title", "description", "policyTitle", "riskTitle"],
  propertyOrdering: ["phase", "title", "description", "policyTitle", "riskTitle"],
};

const POLICY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    body: {
      type: Type.STRING,
      description: "The full draft policy document: numbered sections, defined terms, a real document a client could review.",
    },
  },
  required: ["title", "body"],
  propertyOrdering: ["title", "body"],
};

const RISK_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Short label, under 12 words." },
    description: { type: Type.STRING },
    likelihood: { type: Type.STRING, enum: ["low", "medium", "high"] },
    impact: { type: Type.STRING, enum: ["low", "medium", "high", "critical"] },
  },
  required: ["title", "description", "likelihood", "impact"],
  propertyOrdering: ["title", "description", "likelihood", "impact"],
};

const GOVERNANCE_ASSESSMENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "4-6 sentence executive summary, explicitly mapped onto the five pillars.",
    },
    checklist: { type: Type.ARRAY, items: CHECKLIST_ITEM_SCHEMA },
    policies: { type: Type.ARRAY, items: POLICY_SCHEMA },
    risks: { type: Type.ARRAY, items: RISK_SCHEMA },
  },
  required: ["summary", "checklist", "policies", "risks"],
  propertyOrdering: ["summary", "checklist", "policies", "risks"],
};

/**
 * Runs the AI governance assessment for one focus area. Gracefully no-ops
 * when GEMINI_API_KEY isn't configured, mirroring runProcessReview and the
 * RESEND_API_KEY fallback pattern in lib/email/invitation.ts.
 */
export async function runGovernanceAssessment(promptText: string): Promise<GovernanceAssessmentOutcome> {
  return generateStructured<GovernanceAssessmentResult>({
    systemPrompt: SYSTEM_PROMPT,
    promptText,
    schema: GOVERNANCE_ASSESSMENT_SCHEMA,
    notConfiguredMessage: "AI governance assessment isn't configured for this deployment yet.",
    malformedMessage: "The model did not return a structured assessment.",
  });
}
