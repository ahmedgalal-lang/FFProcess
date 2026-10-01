import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";
import { dirFor } from "@/lib/i18n/locale";
import { LocaleProvider } from "@/lib/i18n/client";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Arabic pages (spec 031); globals.css applies it under lang="ar".
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FFProcess",
  description: "Process mapping, RACI, and authority matrices for consulting engagements.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${geistSans.variable} ${geistMono.variable} ${plexArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
