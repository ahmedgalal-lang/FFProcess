/**
 * Contrast maths for putting text on a client's brand colour. The workspace
 * header paints its background from the logo's extracted Primary, and a logo
 * can just as easily be pale yellow as navy — so the text colour has to be
 * chosen from the background rather than assumed to be white. Pure and
 * framework-free (Constitution Principle III).
 */

export const LIGHT_INK = "#ffffff";
export const DARK_INK = "#0f172a"; // slate-900, the app's normal text colour

type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1]!, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance — the 0–1 lightness used by the contrast formula. */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * White or near-black, whichever is more readable on this background —
 * so a navy logo gets white text and a pale one gets dark text, instead of
 * white-on-yellow.
 */
export function readableInkOn(background: string): string {
  return contrastRatio(background, LIGHT_INK) >= contrastRatio(background, DARK_INK) ? LIGHT_INK : DARK_INK;
}

/** Blends two hex colours; t=0 returns `a`, t=1 returns `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const from = hexToRgb(a);
  const to = hexToRgb(b);
  if (!from || !to) return a;
  const clamped = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: from.r + (to.r - from.r) * clamped,
    g: from.g + (to.g - from.g) * clamped,
    b: from.b + (to.b - from.b) * clamped,
  });
}
