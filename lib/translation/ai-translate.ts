import { Type, type Schema } from "@google/genai";
import { generateStructured } from "@/lib/ai/gemini";

/**
 * The AI half of report translation (spec 032): plans batches, asks the model
 * for translations, and keeps only answers that look like a translation of
 * what was sent. Anything doubtful is left untranslated, never guessed at.
 */

export type TranslationItem = { id: string; text: string };

export type BatchOutcome =
  | { ok: true; translations: Map<string, string> }
  | { ok: false; reason: "NOT_CONFIGURED" | "REQUEST_FAILED"; message: string };

// Small enough that one AI request stays short, so a call's time budget is
// never overshot by much.
export const BATCH_MAX_ITEMS = 40;
export const BATCH_MAX_CHARS = 5000;

/**
 * Splits items into batches of at most BATCH_MAX_ITEMS and about
 * BATCH_MAX_CHARS of source text. A single item longer than the limit
 * gets a batch of its own.
 */
export function planBatches(items: TranslationItem[]): TranslationItem[][] {
  const batches: TranslationItem[][] = [];
  let current: TranslationItem[] = [];
  let chars = 0;
  for (const item of items) {
    if (current.length > 0 && (current.length >= BATCH_MAX_ITEMS || chars + item.text.length > BATCH_MAX_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Keeps the answers that can be trusted: a known id, non-empty text, and not
 * wildly longer than the source. An answer identical to the source is kept:
 * it is how a name, a brand or a term of art is left as written, and saving
 * it stops that text being sent again on every export.
 */
export function acceptTranslations(sent: TranslationItem[], received: unknown): Map<string, string> {
  const sourceById = new Map(sent.map((item) => [item.id, item.text]));
  const accepted = new Map<string, string>();
  if (!received || typeof received !== "object") return accepted;
  const list = (received as { translations?: unknown }).translations;
  if (!Array.isArray(list)) return accepted;
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const { id, text } = entry as { id?: unknown; text?: unknown };
    if (typeof id !== "string" || typeof text !== "string") continue;
    const source = sourceById.get(id);
    const translated = text.trim();
    if (source === undefined || !translated) continue;
    if (translated.length > source.length * 4 + 200) continue;
    accepted.set(id, translated);
  }
  return accepted;
}

const SYSTEM_PROMPT =
  "You translate the content of a management consulting report — process names, process steps, roles, " +
  "responsibilities, approval rules, risks, policies and governance findings — from English into formal, " +
  "professional Modern Standard Arabic as used in Gulf business documents. Translate each item on its own, " +
  "faithfully and completely, keeping its meaning, tone and level of detail; do not summarise, explain or add " +
  "anything. Keep exactly as written: process codes (such as PUR100), people's names, company names, email " +
  "addresses, numbers, amounts and currency codes, dates, the RACI letters R, A, C and I, and well-known " +
  "abbreviations (KPI, SLA, ESG, ISO). Keep line breaks and list markers. Use Western digits (0-9). Return one " +
  "translation for every item, with the item's id unchanged.";

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    translations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { id: { type: Type.STRING }, text: { type: Type.STRING } },
        required: ["id", "text"],
        propertyOrdering: ["id", "text"],
      },
    },
  },
  required: ["translations"],
};

/** Translates one batch into Arabic. */
export async function translateBatch(items: TranslationItem[]): Promise<BatchOutcome> {
  const outcome = await generateStructured<unknown>({
    systemPrompt: SYSTEM_PROMPT,
    promptText: JSON.stringify({ items }),
    schema: SCHEMA,
    notConfiguredMessage: "AI translation isn't configured for this deployment.",
    malformedMessage: "The model did not return translations.",
  });
  if (!outcome.ok) return outcome;
  return { ok: true, translations: acceptTranslations(items, outcome.data) };
}
