import "server-only";
import { Type, type Schema } from "@google/genai";
import { generateStructured } from "./gemini";

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
  "exactly one Accountable role.";

const TEMPLATE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    processName: {
      type: Type.STRING,
      description: 'A clear name for the process, e.g. "Employee Onboarding".',
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["START", "TASK", "DECISION", "END"] },
          label: { type: Type.STRING },
          roleName: {
            type: Type.STRING,
            description: "Suggested role/title responsible for this step. Empty string if none obviously applies.",
          },
        },
        required: ["type", "label", "roleName"],
        propertyOrdering: ["type", "label", "roleName"],
      },
    },
    activities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          assignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                roleName: { type: Type.STRING },
                code: {
                  type: Type.STRING,
                  enum: ["RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"],
                },
              },
              required: ["roleName", "code"],
              propertyOrdering: ["roleName", "code"],
            },
          },
        },
        required: ["name", "assignments"],
        propertyOrdering: ["name", "assignments"],
      },
    },
  },
  required: ["processName", "steps", "activities"],
  propertyOrdering: ["processName", "steps", "activities"],
};

/**
 * Drafts a best-practice Process Map + RACI matrix from a sector/context
 * description. Gracefully no-ops when GEMINI_API_KEY isn't configured,
 * mirroring the same fallback used by the AI Review feature.
 */
export async function runProcessTemplateGeneration(promptText: string): Promise<ProcessTemplateOutcome> {
  return generateStructured<ProcessTemplateResult>({
    systemPrompt: SYSTEM_PROMPT,
    promptText,
    schema: TEMPLATE_SCHEMA,
    notConfiguredMessage: "AI-drafted templates aren't configured for this deployment yet.",
    malformedMessage: "The model did not return a structured draft.",
  });
}
