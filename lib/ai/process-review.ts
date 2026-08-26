import "server-only";
import { GoogleGenAI, Type, FunctionCallingConfigMode, type FunctionDeclaration } from "@google/genai";

export type ProcessReviewFinding = {
  category: "gap" | "risk";
  area: "process_map" | "raci" | "authority" | "general";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  recommendation: string;
};

export type ProcessReviewResult = {
  summary: string;
  findings: ProcessReviewFinding[];
};

export type ProcessReviewOutcome =
  | { ok: true; data: ProcessReviewResult }
  | { ok: false; reason: "NOT_CONFIGURED" | "REQUEST_FAILED"; message: string };

const SYSTEM_PROMPT =
  "You are a process-improvement consultant reviewing a business process end to end — its Process Map, " +
  "RACI matrix, and the workspace's Authority Matrix — against how this workflow is typically run in the " +
  "stated industry/sector. Weigh the process against that sector's normal practice, not a generic checklist: " +
  "a gap or risk is more useful when it says how this deviates from how the industry usually handles it. " +
  "Identify concrete gaps (missing coverage: unassigned steps, undefined ownership, no escalation path) and " +
  "risks (things that could go wrong operationally: single points of failure, segregation-of-duties " +
  "conflicts, bottlenecks, unclear handoffs). Be specific — reference the actual step, activity, or role " +
  "names from the process. Do not invent facts not present in the process description, and don't assume an " +
  "industry norm you're not reasonably confident about. Call submit_process_review exactly once with your " +
  "findings.";

const REVIEW_TOOL: FunctionDeclaration = {
  name: "submit_process_review",
  description: "Submit the structured end-to-end review findings for this business process.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: "2-4 sentence overview of the process's overall health.",
      },
      findings: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, enum: ["gap", "risk"] },
            area: { type: Type.STRING, enum: ["process_map", "raci", "authority", "general"] },
            severity: { type: Type.STRING, enum: ["high", "medium", "low"] },
            title: { type: Type.STRING, description: "Short label, under 10 words." },
            description: { type: Type.STRING, description: "What the issue is and where it shows up." },
            recommendation: { type: Type.STRING, description: "A concrete next step to close the gap or mitigate the risk." },
          },
          required: ["category", "area", "severity", "title", "description", "recommendation"],
        },
      },
    },
    required: ["summary", "findings"],
  },
};

/**
 * Runs the AI end-to-end process review. Gracefully no-ops when
 * GEMINI_API_KEY isn't configured (local dev, this sandbox), mirroring the
 * RESEND_API_KEY fallback pattern in lib/email/invitation.ts.
 */
export async function runProcessReview(promptText: string): Promise<ProcessReviewOutcome> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    return {
      ok: false,
      reason: "NOT_CONFIGURED",
      message: "AI review isn't configured for this deployment yet.",
    };
  }

  const client = new GoogleGenAI({ apiKey });

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-pro",
      contents: promptText,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: [REVIEW_TOOL] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ["submit_process_review"],
          },
        },
      },
    });

    const call = response.functionCalls?.[0];
    if (!call) {
      return { ok: false, reason: "REQUEST_FAILED", message: "Gemini did not return structured findings." };
    }

    return { ok: true, data: call.args as unknown as ProcessReviewResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI review request failed.";
    return { ok: false, reason: "REQUEST_FAILED", message };
  }
}
