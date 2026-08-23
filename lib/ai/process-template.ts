import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type TemplateStep = {
  type: "START" | "TASK" | "DECISION" | "END";
  label: string;
  roleName: string;
};

export type TemplateActivity = {
  name: string;
  assignments: { roleName: string; code: "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED" }[];
};

export type ProcessTemplateResult = {
  processName: string;
  steps: TemplateStep[];
  activities: TemplateActivity[];
};

export type ProcessTemplateOutcome =
  | { ok: true; data: ProcessTemplateResult }
  | { ok: false; reason: "NOT_CONFIGURED" | "REQUEST_FAILED"; message: string };

const SYSTEM_PROMPT =
  "You are a business-process consultant drafting a best-practice first pass for a client's process, given " +
  "their industry/sector and any background notes. Produce a realistic Process Map (steps in logical order, " +
  "starting with START and ending with END, using DECISION steps wherever the process actually branches — " +
  "never a decision with only one real outcome) and a RACI matrix covering the process's key activities. " +
  "Use role/title names a real org chart would have (e.g. \"AP Clerk\", \"Finance Manager\"), never people's " +
  "names. This is a draft the consultant will edit before using it — aim for roughly 5-10 steps and 3-8 " +
  "activities, favoring a clear industry-standard structure over exhaustive detail. Every RACI activity needs " +
  "exactly one Accountable role. Call submit_process_template exactly once.";

const TEMPLATE_TOOL: Anthropic.Tool = {
  name: "submit_process_template",
  description: "Submit a first-draft Process Map and RACI matrix for this business process.",
  input_schema: {
    type: "object",
    properties: {
      processName: { type: "string", description: "A clear name for the process, e.g. \"Employee Onboarding\"." },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["START", "TASK", "DECISION", "END"] },
            label: { type: "string" },
            roleName: {
              type: "string",
              description: "Suggested role/title responsible for this step. Empty string if none obviously applies.",
            },
          },
          required: ["type", "label", "roleName"],
        },
      },
      activities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            assignments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  roleName: { type: "string" },
                  code: { type: "string", enum: ["RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"] },
                },
                required: ["roleName", "code"],
              },
            },
          },
          required: ["name", "assignments"],
        },
      },
    },
    required: ["processName", "steps", "activities"],
  },
};

/**
 * Drafts a best-practice Process Map + RACI matrix from a sector/context
 * description. Gracefully no-ops when ANTHROPIC_API_KEY isn't configured,
 * mirroring the same fallback used by the AI Review feature.
 */
export async function runProcessTemplateGeneration(promptText: string): Promise<ProcessTemplateOutcome> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return {
      ok: false,
      reason: "NOT_CONFIGURED",
      message: "AI-drafted templates aren't configured for this deployment yet.",
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      tools: [TEMPLATE_TOOL],
      tool_choice: { type: "tool", name: "submit_process_template" },
      messages: [{ role: "user", content: promptText }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) {
      return { ok: false, reason: "REQUEST_FAILED", message: "Claude did not return a structured draft." };
    }

    return { ok: true, data: toolUse.input as ProcessTemplateResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Template generation request failed.";
    return { ok: false, reason: "REQUEST_FAILED", message };
  }
}
