/**
 * Validates an uploaded Workspace logo and its accent color before they're
 * stored on the Workspace record. Pure and framework-free (Constitution
 * Principle III).
 */

const MAX_LOGO_DATA_URL_LENGTH = 400_000; // ~300KB raw file, base64-inflated
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export function validateLogoDataUrl(dataUrl: string): { ok: true } | { ok: false; message: string } {
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,/.exec(dataUrl);
  if (!match) return { ok: false, message: "Logo must be an uploaded image file." };
  if (!ALLOWED_MIME_TYPES.includes(match[1])) {
    return { ok: false, message: "Logo must be a PNG, JPEG, WebP, or SVG image." };
  }
  if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
    return { ok: false, message: "Logo file is too large — please use an image under 300KB." };
  }
  return { ok: true };
}

export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
