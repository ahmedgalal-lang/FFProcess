# Implementation Plan: Governance Section Guides

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

## Summary

A reusable `SectionGuide` button-and-popover beside each Governance section
heading, reading its text from a typed content module holding the approved
mockup's copy.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19. No schema change, no server actions.
**Testing**: Vitest (every guide complete), Playwright (open, switch tabs, close, focus return, one at a time, axe).

## Design

- `lib/domain/section-guides.ts`: `SECTION_GUIDES` keyed by section id, each `{ title, what, why[], how[], good[], bad[], ref? }`.
- `governance/section-guide.tsx` (client): the ⓘ button (`aria-label="About <title>"`, `aria-expanded`, `aria-controls`) and a non-modal `role="dialog"` popover anchored below it, with an ARIA tablist (arrow keys), Esc/×/outside-click close, focus to the heading on open and back to the button on Esc/×. A module-level event makes opening one guide close any other.
- The button sits beside each `h2`, never inside it, so heading and region names are unchanged.

## Constitution Check

I–VI PASS: no data, no access change; accessible by construction and axe-checked; one small component.
