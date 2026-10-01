"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { messagesFor, type Messages } from "./messages";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Passes only the locale down: the dictionaries hold functions (for counts
 * and names), which can't cross from server to client, so client
 * components import them directly through useMessages.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useMessages(): Messages {
  return messagesFor(useContext(LocaleContext));
}
