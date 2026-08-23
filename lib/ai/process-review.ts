import "server-only";
import Anthropic from "@anthropic-ai/sdk";

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

const REVIEW_TOOL: Anthropic.Tool = {
  name: "submit_process_review",
  description: "Submit the structured end-to-end review findings for this business process.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "2-4 sentence overview of the process's overall health.",
      },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: ["gap", "risk"] },
            area: { type: "string", enum: ["process_map", "raci", "authority", "general"] },
            severity: { type: "string", enum: ["high", "medium", "low"] },
            title: { type: "string", description: "Short label, under 10 words." },
            description: { type: "string", description: "What the issue is and where it shows up." },
            recommendation: { type: "string", description: "A concrete next step to close the gap or mitigate the risk." },
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
 * ANTHROPIC_API_KEY isn't configured (local dev, this sandbox), mirroring the
 * RESEND_API_KEY fallback pattern in lib/email/invitation.ts.
 */
export async function runProcessReview(promptText: string): Promise<ProcessReviewOutcome> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return {
      ok: false,
      reason: "NOT_CONFIGURED",
      message: "AI review isn't configured for this deployment yet.",
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      tools: [REVIEW_TOOL],
      tool_choice: { type: "tool", name: "submit_process_review" },
      messages: [{ role: "user", content: promptText }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) {
      return { ok: false, reason: "REQUEST_FAILED", message: "Claude did not return structured findings." };
    }

    return { ok: true, data: toolUse.input as ProcessReviewResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI review request failed.";
    return { ok: false, reason: "REQUEST_FAILED", message };
  }
}
