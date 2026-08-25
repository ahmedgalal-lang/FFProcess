import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type ProcessReportDraft = {
  processPurpose: string;
  inScope: string[];
  outOfScope: string[];
  externalEntities: { name: string; description: string }[];
  steps: { rowId: string; detailedAction: string[]; exceptionHandling: string }[];
  kpis: { metric: string; target: string; frequency: string }[];
};

export type ProcessReportDraftOutcome =
  | { ok: true; data: ProcessReportDraft }
  | { ok: false; reason: "NOT_CONFIGURED" | "REQUEST_FAILED"; message: string };

const SYSTEM_PROMPT =
  "You are a business-process documentation writer drafting the narrative sections of a formal process " +
  "standard document (in the style of an ISO-adjacent SOP: Executive Summary, Involved Parties, per-step " +
  "procedure detail, Governance KPIs) from a process's real task list — its RACI assignments and Authority " +
  "Matrix thresholds. Ground everything in the task rows given; do not invent steps, roles, or thresholds " +
  "that aren't there. Write in a neutral, formal documentation register — third person, no marketing language. " +
  "For each task row, draft 1-3 short numbered Detailed Action bullets describing how that task is actually " +
  "carried out given its RACI assignments, and one Exception Handling sentence describing what happens if it " +
  "doesn't go as planned (an approval is rejected, a threshold is exceeded, information is missing) — reuse " +
  "the row's own rowId exactly as given so the caller can match your draft back to the right row. " +
  "Call submit_process_report_draft exactly once.";

const DRAFT_TOOL: Anthropic.Tool = {
  name: "submit_process_report_draft",
  description: "Submit the drafted narrative sections for this process's documentation report.",
  input_schema: {
    type: "object",
    properties: {
      processPurpose: {
        type: "string",
        description: "2-4 sentence statement of why this process exists and what it standardizes.",
      },
      inScope: {
        type: "array",
        items: { type: "string" },
        description: "Short bullet phrases of what this process covers.",
      },
      outOfScope: {
        type: "array",
        items: { type: "string" },
        description: "Short bullet phrases of related activity this process explicitly does not cover.",
      },
      externalEntities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string", description: "One sentence on this entity's role in the process." },
          },
          required: ["name", "description"],
        },
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rowId: { type: "string", description: "Exact rowId from the task rows given in the prompt." },
            detailedAction: { type: "array", items: { type: "string" }, description: "1-3 short numbered-step phrases." },
            exceptionHandling: { type: "string", description: "One sentence." },
          },
          required: ["rowId", "detailedAction", "exceptionHandling"],
        },
      },
      kpis: {
        type: "array",
        items: {
          type: "object",
          properties: {
            metric: { type: "string" },
            target: { type: "string" },
            frequency: { type: "string" },
          },
          required: ["metric", "target", "frequency"],
        },
        description: "2-4 plausible operational metrics for a process like this one.",
      },
    },
    required: ["processPurpose", "inScope", "outOfScope", "externalEntities", "steps", "kpis"],
  },
};

/**
 * Drafts the narrative sections of a process documentation report. Gracefully
 * no-ops when ANTHROPIC_API_KEY isn't configured, mirroring runProcessReview.
 */
export async function draftProcessReportNarrative(promptText: string): Promise<ProcessReportDraftOutcome> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return {
      ok: false,
      reason: "NOT_CONFIGURED",
      message: "AI drafting isn't configured for this deployment yet — fill these sections in by hand.",
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      tools: [DRAFT_TOOL],
      tool_choice: { type: "tool", name: "submit_process_report_draft" },
      messages: [{ role: "user", content: promptText }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) {
      return { ok: false, reason: "REQUEST_FAILED", message: "Claude did not return a structured draft." };
    }

    return { ok: true, data: toolUse.input as ProcessReportDraft };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI drafting request failed.";
    return { ok: false, reason: "REQUEST_FAILED", message };
  }
}
