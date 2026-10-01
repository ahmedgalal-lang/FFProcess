import path from "node:path";
import { Font } from "@react-pdf/renderer";
import type { Locale } from "@/lib/i18n/locale";

/** The face an Arabic PDF is set in: it carries both Arabic and Latin letters. */
export const ARABIC_PDF_FONT = "IBM Plex Sans Arabic";

let registered = false;

function registerArabicFont() {
  if (registered) return;
  const dir = path.join(process.cwd(), "lib/export/fonts");
  Font.register({
    family: ARABIC_PDF_FONT,
    fonts: [
      { src: path.join(dir, "IBMPlexSansArabic-Regular.woff") },
      { src: path.join(dir, "IBMPlexSansArabic-Bold.woff"), fontWeight: 700 },
    ],
  });
  registered = true;
}

/**
 * How a PDF document is set for its language (spec 032). English is exactly
 * as before. Arabic embeds the Arabic font and sets every text right to left:
 * without the explicit direction, trailing punctuation and wrapped lines are
 * placed as if the text ran left to right.
 */
export function pdfDirection(locale: Locale) {
  if (locale !== "ar") return { rtl: false as const, page: {}, text: {}, centred: {}, row: {} };
  registerArabicFont();
  return {
    rtl: true as const,
    page: { fontFamily: ARABIC_PDF_FONT },
    text: { direction: "rtl" as const, textAlign: "right" as const },
    /** Right to left, for text that stays centred. */
    centred: { direction: "rtl" as const },
    row: { flexDirection: "row-reverse" as const },
  };
}
