import "server-only";
import { GoogleGenAI, Type, FunctionCallingConfigMode, type FunctionDeclaration } from "@google/genai";

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

const DRAFT_TOOL: FunctionDeclaration = {
  name: "submit_process_report_draft",
  description: "Submit the drafted narrative sections for this process's documentation report.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      processPurpose: {
        type: Type.STRING,
        description: "2-4 sentence statement of why this process exists and what it standardizes.",
      },
      inScope: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Short bullet phrases of what this process covers.",
      },
      outOfScope: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Short bullet phrases of related activity this process explicitly does not cover.",
      },
      externalEntities: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING, description: "One sentence on this entity's role in the process." },
          },
          required: ["name", "description"],
        },
      },
      steps: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            rowId: { type: Type.STRING, description: "Exact rowId from the task rows given in the prompt." },
            detailedAction: { type: Type.ARRAY, items: { type: Type.STRING }, description: "1-3 short numbered-step phrases." },
            exceptionHandling: { type: Type.STRING, description: "One sentence." },
          },
          required: ["rowId", "detailedAction", "exceptionHandling"],
        },
      },
      kpis: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            metric: { type: Type.STRING },
            target: { type: Type.STRING },
            frequency: { type: Type.STRING },
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
 * no-ops when GEMINI_API_KEY isn't configured, mirroring runProcessReview.
 */
export async function draftProcessReportNarrative(promptText: string): Promise<ProcessReportDraftOutcome> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    return {
      ok: false,
      reason: "NOT_CONFIGURED",
      message: "AI drafting isn't configured for this deployment yet — fill these sections in by hand.",
    };
  }

  const client = new GoogleGenAI({ apiKey });

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-pro",
      contents: promptText,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: [DRAFT_TOOL] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ["submit_process_report_draft"],
          },
        },
      },
    });

    const call = response.functionCalls?.[0];
    if (!call) {
      return { ok: false, reason: "REQUEST_FAILED", message: "Gemini did not return a structured draft." };
    }

    return { ok: true, data: call.args as unknown as ProcessReportDraft };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI drafting request failed.";
    return { ok: false, reason: "REQUEST_FAILED", message };
  }
}
