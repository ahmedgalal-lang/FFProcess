import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The SDK's own error shape (`throwErrorIfNotOK` in `@google/genai`): a
 * thrown `Error` whose `.message` is `JSON.stringify` of the raw HTTP error
 * body — not prose. Reported live: an overloaded model surfaced
 * `{"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}` verbatim on
 * a consultant's screen, because `generateStructured`'s catch block passed
 * `error.message` straight through as the outcome's message.
 */
function sdkError(body: { code: number; status: string; message: string }) {
  return new Error(JSON.stringify({ error: body }));
}

const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI(this: { models: unknown }) {
    this.models = { generateContent: mockGenerateContent };
  }),
  Type: { OBJECT: "OBJECT", STRING: "STRING", ARRAY: "ARRAY" },
}));

const { generateStructured } = await import("@/lib/ai/gemini");

const CALL = {
  systemPrompt: "system",
  promptText: "prompt",
  schema: { type: "OBJECT" } as never,
  notConfiguredMessage: "not configured",
  malformedMessage: "malformed",
};

describe("generateStructured error messages", () => {
  const originalKey = process.env["GEMINI_API_KEY"];

  beforeEach(() => {
    process.env["GEMINI_API_KEY"] = "test-key";
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env["GEMINI_API_KEY"];
    else process.env["GEMINI_API_KEY"] = originalKey;
  });

  it("turns a 503 UNAVAILABLE body into a plain retry sentence, not the raw JSON", async () => {
    mockGenerateContent.mockRejectedValue(
      sdkError({ code: 503, status: "UNAVAILABLE", message: "The model is overloaded." })
    );

    const outcome = await generateStructured(CALL);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("REQUEST_FAILED");
    expect(outcome.message).not.toContain("{"); // never the raw JSON body
    expect(outcome.message).toBe("The AI model is temporarily overloaded. Please try again in a moment.");
  });

  it("turns a 429 RESOURCE_EXHAUSTED body into a rate-limit sentence", async () => {
    mockGenerateContent.mockRejectedValue(
      sdkError({ code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded." })
    );

    const outcome = await generateStructured(CALL);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).not.toContain("{");
    expect(outcome.message).toBe("The AI service has hit its rate limit. Please try again shortly.");
  });

  it("turns a 403 PERMISSION_DENIED body into a credentials sentence", async () => {
    mockGenerateContent.mockRejectedValue(
      sdkError({ code: 403, status: "PERMISSION_DENIED", message: "API key invalid." })
    );

    const outcome = await generateStructured(CALL);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).not.toContain("{");
    expect(outcome.message).toBe("This deployment's AI credentials were rejected. Contact an administrator.");
  });

  it("falls back to Google's own message field for a status this code doesn't special-case", async () => {
    mockGenerateContent.mockRejectedValue(
      sdkError({ code: 400, status: "INVALID_ARGUMENT", message: "The request body is malformed." })
    );

    const outcome = await generateStructured(CALL);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toBe("The request body is malformed.");
  });

  it("falls back to the raw error text when it isn't the SDK's JSON body at all", async () => {
    mockGenerateContent.mockRejectedValue(new Error("network socket hang up"));

    const outcome = await generateStructured(CALL);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toBe("network socket hang up");
  });

  it("still returns NOT_CONFIGURED, untouched, when there's no API key", async () => {
    delete process.env["GEMINI_API_KEY"];

    const outcome = await generateStructured(CALL);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("NOT_CONFIGURED");
    expect(outcome.message).toBe("not configured");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
