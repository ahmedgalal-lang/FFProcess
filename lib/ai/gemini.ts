import "server-only";
import { GoogleGenAI, type Schema } from "@google/genai";

/**
 * Shared Gemini access for the AI features (process review, template
 * generation). Both need the same thing: one prompt in, one JSON object out,
 * shaped by a fixed schema — so they share this instead of each holding their
 * own client and error handling.
 *
 * Structured output is done with responseSchema rather than function calling:
 * there's only ever one shape we want back, and constraining decoding to it
 * is more reliable than asking the model to choose a tool.
 */

export type StructuredOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "NOT_CONFIGURED" | "REQUEST_FAILED"; message: string };

/**
 * Overridable per deployment via GEMINI_MODEL. 3.5-flash is the default
 * because it returned the same quality of draft as the newer 3.7-flash on
 * this workload while taking ~7s rather than ~45s — and these calls happen
 * inside a request a consultant is waiting on.
 */
const DEFAULT_MODEL = "gemini-3.5-flash";

export function geminiModel(): string {
  return process.env["GEMINI_MODEL"] || DEFAULT_MODEL;
}

export async function generateStructured<T>(params: {
  systemPrompt: string;
  promptText: string;
  schema: Schema;
  /** Shown to the user when the deployment has no API key configured. */
  notConfiguredMessage: string;
  /** Shown when the model replies but not with usable JSON. */
  malformedMessage: string;
}): Promise<StructuredOutcome<T>> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    return { ok: false, reason: "NOT_CONFIGURED", message: params.notConfiguredMessage };
  }

  const client = new GoogleGenAI({ apiKey });

  try {
    const response = await client.models.generateContent({
      model: geminiModel(),
      contents: params.promptText,
      config: {
        systemInstruction: params.systemPrompt,
        responseMimeType: "application/json",
        responseSchema: params.schema,
        // Generous, because thinking tokens are drawn from this same budget:
        // too low and the model can spend it all reasoning and return nothing.
        maxOutputTokens: 16384,
      },
    });

    const text = response.text;
    if (!text) {
      return { ok: false, reason: "REQUEST_FAILED", message: params.malformedMessage };
    }

    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, reason: "REQUEST_FAILED", message: params.malformedMessage };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed.";
    return { ok: false, reason: "REQUEST_FAILED", message };
  }
}
