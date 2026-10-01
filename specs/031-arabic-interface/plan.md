# Implementation Plan: Arabic Interface

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

## Approach

Following the Next.js internationalization guide's dictionary pattern, with
the locale in a cookie rather than a URL prefix (an authenticated app with
no public pages to index; moving every route under `[lang]` would gain
nothing).

- `lib/i18n/locale.ts`: `Locale = "en" | "ar"`, cookie `ffp-locale`, `dirFor`, `dateLocale` (`ar-u-nu-latn` keeps Western digits).
- `lib/i18n/messages/en.ts` is the source of truth; `ar.ts` is typed against it, so a missing Arabic key fails the type check. Strings with counts or names are functions (Arabic plural forms handled in them).
- Server components: `await getMessages()` / `await getLocale()` (reads the cookie). Client components: `useMessages()` / `useLocale()` from a provider in the root layout that passes only the locale; both dictionaries are plain modules imported client-side.
- `setLocale` server action sets the cookie; the switcher refreshes the page.
- Root layout sets `<html lang dir>` and loads IBM Plex Sans Arabic alongside Geist.
- Layout direction: physical Tailwind classes (`ml-`, `pr-`, `text-left`, `left-`…) converted to logical ones (`ms-`, `pe-`, `text-start`, `start-`…) app-wide; diagram canvases are wrapped `dir="ltr"`.
- Governance content: Arabic default aspect names (display mapping by the English default), section guides and templates get Arabic versions keyed the same way.
- AI: each generator receives the locale and the prompt asks for output in that language.

## Stages

1. Infrastructure, switcher, logical CSS, app shell, Governance area and its content, AI language.
2. Every other page and component.
3. Printed report, PPTX, spreadsheets, server action messages.

## Constitution Check

PASS: no data model change (cookie only); accessible (`lang`/`dir` set, axe in both languages); no new dependency.
