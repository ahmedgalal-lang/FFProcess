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
    return { ok: false, reason: "REQUEST_FAILED", message: describeGeminiError(error) };
  }
}

/**
 * A human message for whatever the SDK threw.
 *
 * The SDK's own `ApiError.message` is not prose — it's `JSON.stringify` of
 * the raw HTTP error body (`throwErrorIfNotOK` in `@google/genai`), so an
 * overloaded model surfaced as `{"error":{"code":503,"message":"...",
 * "status":"UNAVAILABLE"}}` straight through to a consultant's screen. This
 * unwraps that body — Google's own `error.message` field when it's there —
 * and falls back to a status-keyed message for the cases worth telling apart
 * (overloaded, rate-limited) so at least those read as sentences rather than
 * a stack of JSON.
 */
function describeGeminiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  let code: number | undefined;
  let status: string | undefined;
  let detail: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; status?: string; message?: string } };
    code = parsed.error?.code;
    status = parsed.error?.status;
    detail = parsed.error?.message;
  } catch {
    // Not JSON — whatever `raw` already is stays the fallback below.
  }

  if (code === 503 || status === "UNAVAILABLE") {
    return "The AI model is temporarily overloaded. Please try again in a moment.";
  }
  if (code === 429 || status === "RESOURCE_EXHAUSTED") {
    return "The AI service has hit its rate limit. Please try again shortly.";
  }
  if (code === 401 || code === 403 || status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED") {
    return "This deployment's AI credentials were rejected. Contact an administrator.";
  }

  return detail || raw || "AI request failed.";
}
