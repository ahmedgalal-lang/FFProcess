import "server-only";
import { prisma } from "@/lib/db/client";
import type { Locale } from "@/lib/i18n/locale";
import { isTranslatable, normalizeSource, sourceHash } from "./translatable";
import { planBatches, translateBatch, type TranslationItem } from "./ai-translate";

export type TranslationOutcome = {
  /** What to print for a piece of text: its saved translation, or the text as typed. */
  lookup: (text: string) => string;
  /** Distinct translatable texts asked about. */
  total: number;
  /** Distinct translatable texts still without a translation. */
  untranslated: number;
  /** Why some were left untranslated, as the AI reported it, or null. */
  failure: string | null;
  /** The kind of failure, for wording it in the reader's language. */
  failureKind: TranslationFailureKind | null;
};

export type TranslationFailureKind = "NOT_CONFIGURED" | "REQUEST_FAILED";

/** How many AI requests run at once for one export. */
const CONCURRENCY = 3;

const identity: TranslationOutcome = { lookup: (text) => text, total: 0, untranslated: 0, failure: null, failureKind: null };

/**
 * The saved translations of a workspace's texts into `locale` (spec 032),
 * translating and saving any that are missing unless `allowAi` is false.
 * A translation is keyed by the exact text, so an unchanged entry is never
 * translated twice and a changed one always is. A row corrected by hand is
 * only ever read here: the AI fills texts that have no row at all.
 *
 * The caller must already have checked access to the workspace.
 */
export async function translateTexts(
  workspaceId: string,
  texts: Iterable<string>,
  locale: Locale,
  options: { allowAi?: boolean } = {}
): Promise<TranslationOutcome> {
  if (locale === "en") return identity;

  const byHash = new Map<string, string>();
  for (const text of texts) {
    if (typeof text === "string" && isTranslatable(text)) byHash.set(sourceHash(text), normalizeSource(text));
  }
  if (byHash.size === 0) return identity;

  const translated = new Map<string, string>();
  const saved = await prisma.contentTranslation.findMany({
    where: { workspaceId, locale, sourceHash: { in: [...byHash.keys()] } },
    select: { sourceHash: true, text: true },
  });
  for (const row of saved) translated.set(row.sourceHash, row.text);

  let failure: string | null = null;
  let failureKind: TranslationFailureKind | null = null;
  const missing: TranslationItem[] = [...byHash].filter(([hash]) => !translated.has(hash)).map(([id, text]) => ({ id, text }));

  if (missing.length > 0 && options.allowAi !== false) {
    const batches = planBatches(missing);
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const batch = batches[next++]!;
        const outcome = await translateBatch(batch);
        if (!outcome.ok) {
          failure ??= outcome.message;
          failureKind ??= outcome.reason;
          // Not configured means every batch would fail the same way.
          if (outcome.reason === "NOT_CONFIGURED") next = batches.length;
          continue;
        }
        if (outcome.translations.size === 0) continue;
        await prisma.contentTranslation.createMany({
          data: [...outcome.translations].map(([hash, text]) => ({
            workspaceId,
            locale,
            sourceHash: hash,
            sourceText: byHash.get(hash)!,
            text,
          })),
          // Another export may have saved the same text a moment ago; theirs stands.
          skipDuplicates: true,
        });
        for (const [hash, text] of outcome.translations) translated.set(hash, text);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

    // Read back what was saved, so a row another export won a race with is the one used.
    const hashes = missing.map((m) => m.id).filter((hash) => translated.has(hash));
    if (hashes.length > 0) {
      const stored = await prisma.contentTranslation.findMany({
        where: { workspaceId, locale, sourceHash: { in: hashes } },
        select: { sourceHash: true, text: true },
      });
      for (const row of stored) translated.set(row.sourceHash, row.text);
    }
  }

  const untranslated = [...byHash.keys()].filter((hash) => !translated.has(hash)).length;
  return {
    lookup: (text) => (isTranslatable(text) ? (translated.get(sourceHash(text)) ?? text) : text),
    total: byHash.size,
    untranslated,
    failure: untranslated > 0 ? failure : null,
    failureKind: untranslated > 0 ? failureKind : null,
  };
}
