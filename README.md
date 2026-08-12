# FFProcess

Process mapping, RACI matrices, and authority (delegation-of-authority) matrices for
consulting engagements — one shared org model (Roles, People, Processes) reused across all
three views, scoped per client Workspace under a single Firm.

Full product spec, plan, and task breakdown: [`specs/001-process-mapping-raci-authority/`](specs/001-process-mapping-raci-authority/).
Governing principles: [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Stack

Next.js 16 (App Router, TypeScript strict) · PostgreSQL via Prisma 7 (driver adapters) ·
Auth.js v5 (Credentials, JWT sessions) · Zod · Vitest · Playwright.

## Setup

1. **Database**: point `DATABASE_URL` (see `.env.example`) at a PostgreSQL 16 instance.
2. **Install & configure**:
   ```bash
   pnpm install
   cp .env.example .env   # fill in DATABASE_URL and AUTH_SECRET
   pnpm db:migrate         # applies prisma/migrations
   pnpm db:seed            # seeds a demo Firm + Workspace (see below)
   pnpm dev
   ```
3. Open http://localhost:3000 — sign in with a seeded account (password `password123` for both):
   - `ahmed.galal@forefront.consulting` — **Firm Owner** (reaches every client Workspace via
     the Constitution Principle V carve-out, even without an explicit Member record)
   - `sam.osei@acme-example.com` — Editor on the "Acme Industrial" Workspace only

The seed creates one Workspace ("Acme Industrial") with a Purchase-to-Pay process
(`PUR101`, under program `PUR100`), its RACI matrix (with one intentional validation gap to
demonstrate FR-006), an Authority Matrix for "Purchase Order" approvals, and cross-process
links to `PUR102` (Vendor Onboarding) and `SAL101` (Sales Order Fulfillment).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev / production build / start |
| `pnpm lint` | ESLint |
| `pnpm test` / `pnpm test:watch` | Vitest — business-rule unit tests (`tests/unit/`) |
| `pnpm test:e2e` | Playwright — end-to-end workflows (`tests/e2e/`), auto-starts the dev server |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:generate` | `prisma generate` (also runs on `postinstall`) |
| `pnpm db:seed` | Runs `prisma/seed.ts` |
| `pnpm db:studio` | `prisma studio` — browse the database |

## What's implemented

- Auth (email/password via Credentials + JWT sessions), Firm Owner cross-workspace carve-out;
  Firm Settings page for Firm Owners to promote/demote other Firm Owners (`/firm/settings`,
  linked from the header only when signed in as one), with a guard against removing the last one
- Org Directory (Roles, People) with archive-not-delete semantics
- Processes: creation with unique Process Codes, main/sub-process hierarchy, cross-process
  step links (one step can link to multiple other Processes)
- Process Map: React Flow diagram canvas (swimlanes, decision diamonds, drag-to-reposition
  with autosave, drag-to-connect between step handles, click-to-select + Delete a connector)
  with a Diagram/Steps-List toggle over the same underlying data (FR-027); add-step flow with
  auto-layout (lane by Role, appended left-to-right); PNG export of the live canvas
- RACI Matrix: live grid, validation (missing/multiple Accountable, missing Responsible),
  finalize/reopen lifecycle, PDF/Excel export
- Authority Matrix: threshold + co-approval rules, approver query tool, gap/conflict detection,
  PDF/Excel export
- Members: invite by email with a tokenized accept link (7-day expiry) — sent via Resend when
  `RESEND_API_KEY` is configured, otherwise shown directly in the UI as a shareable link;
  the accept page creates an account for brand-new invitees or signs an existing account in;
  access-level management, last-Admin protection
- All business rules (`lib/domain/*`) are unit-tested first, per Constitution Principle III
- Accessibility: keyboard node focus/move + ARIA labeling on the Process Map canvas, arrow-key
  grid navigation + ARIA semantics on the RACI grid, and an automated axe-core scan
  (`tests/e2e/accessibility.spec.ts`) covering the Process Map, RACI, and Authority pages with
  zero violations

## Not yet built

A full manual screen-reader walkthrough (the accessibility pass so far is keyboard nav + ARIA +
automated axe-core scanning, not hands-on assistive-tech testing), and most of the Playwright
E2E coverage beyond `tests/e2e/core-workflows.spec.ts` and `tests/e2e/accessibility.spec.ts`.
See `specs/001-process-mapping-raci-authority/tasks.md` for the full remaining task list.
