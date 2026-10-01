import { createHash } from "node:crypto";

/**
 * Which pieces of a workspace's text are worth translating for an Arabic
 * report (spec 032), and how a piece of text is identified. Pure.
 */

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN_LETTER = /[A-Za-z]/;
/** A process code or similar token, such as PUR100 or FIN-2. */
const CODE = /^[A-Z]{2,}[-_]?\d+(\.\d+)*$/;

/** The text as stored and looked up: outer whitespace never matters. */
export function normalizeSource(text: string): string {
  return text.trim();
}

/**
 * True for text an Arabic reader needs translated. False for what stays as
 * written: empty text, text already in Arabic, numbers and amounts, and codes.
 */
export function isTranslatable(text: string): boolean {
  const s = normalizeSource(text);
  if (!s) return false;
  if (ARABIC.test(s)) return false;
  if (!LATIN_LETTER.test(s)) return false;
  if (CODE.test(s)) return false;
  return true;
}

/** The key a translation is saved under: the same text always has the same key. */
export function sourceHash(text: string): string {
  return createHash("sha256").update(normalizeSource(text), "utf8").digest("hex");
}
